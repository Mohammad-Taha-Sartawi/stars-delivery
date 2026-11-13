const { sendInternalServerError, sendInternalServerFailure } = require('../security/errorResponse');
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const {
  permanentlyDeleteAccount,
  AccountDeletionBlockedError,
} = require('../services/accountDeletion');
const Order = require('../models/Order');
const { customerRatingSummaries } = require('../services/customerRatings');
const Notification = require('../models/Notification');
const {
  MIN_MOBILE_PASSWORD_LENGTH,
  MAX_MOBILE_PASSWORD_LENGTH,
  isValidMobilePassword,
} = require('../security/passwordPolicy');
const {
  mobileSessionRotationFilter,
} = require('../services/mobileSession');
const {
  resolveRegistrationLocation,
  canonicalGovernorate,
  isValidAreaForGovernorate,
} = require('../services/registrationLocation');
const {
  normalizeMobileEmail,
  isValidMobileEmail,
} = require('../security/mobileEmail');
const {
  findActiveAccountByEmail,
  findActiveAccountByPublicId,
} = require('../services/accountRelease');
const { isValidAdminPublicId } = require('../utils/publicId');
const {
  normalizePhoneNumber,
  isValidPhoneNumber,
  INVALID_PHONE_MESSAGE,
  replacePrimaryPhone,
} = require('../services/phoneNumbers');

router.get('/', async (req, res) => {
  try {
    const users = await User.find({
      role: 'customer',
      deleted: { $ne: true },
    })
      .select('fullName publicId email phoneNumbers area governorate status createdAt deleted')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json(users.map((user) => {
      const location = resolveRegistrationLocation(user);
      return {
        _id: user._id.toString(),
        fullName: user.fullName,
        publicId: user.publicId || '',
        email: user.email || '',
        phone:
          user.phoneNumbers?.find((phone) => phone.primary)?.number
          || user.phoneNumbers?.[0]?.number
          || '',
        area: user.area || '',
        governorate: location.governorate,
        city: location.city,
        status: user.status || '',
        createdAt: user.createdAt,
      };
    }));
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.get('/search', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.json({ error: 'الرجاء إدخال ID المستخدم أو الاسم' });

    const searchTerms = [
      { publicId: id },
      { fullName: { $regex: id, $options: 'i' } },
    ];

    if (mongoose.isValidObjectId(id)) {
      searchTerms.push({ _id: id });
    }

    const user = await User.findOne({
      role: 'customer',
      deleted: { $ne: true },
      $or: searchTerms,
    }).lean();

    if (!user) return res.json({ error: 'لم يتم العثور على مستخدم' });

    const orders = await Order.find({ customerId: user._id }).lean();
    const ratingSummary =
      (await customerRatingSummaries([user._id])).get(user._id.toString()) || null;
    const location = resolveRegistrationLocation(user);
    const mappedUser = {
      _id: user._id.toString(),
      userId: user.publicId || user._id.toString().slice(-8),
      name: user.fullName || user.name,
      email: user.email,
      phone:
        user.phoneNumbers?.find((phone) => phone.primary)?.number
        || user.phoneNumbers?.[0]?.number
        || user.phone
        || '',
      joinDate: user.createdAt ? user.createdAt.toISOString().split('T')[0] : 'غير محدد',
      area: user.area || 'غير محدد',
      governorate: location.governorate,
      city: location.city,
      status: user.status === 'blocked' ? 'inactive' : user.status,
      publicId: user.publicId || '',
      rating: ratingSummary,
      orders: orders.map(o => ({
        fullId: o._id.toString(),
        orderId: o._id.toString().slice(-8),
        type: o.type || 'غير محدد',
        date: o.createdAt ? o.createdAt.toISOString().split('T')[0] : 'غير محدد',
        status: o.status,
        amount: o.price || 0,
        driver: o.providerId?.toString() || 'غير محدد',
        content: o.description || ''
      })),
      messages: user.messages || []
    };

    res.json({ user: mappedUser });
  } catch (err) {
    sendInternalServerError(res);
  }
});

// Edits a customer's details from the dashboard (the same fields drivers
// have): name, email, primary phone, governorate/city and public ID.
router.put('/:id/profile', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }
    const customer = await User.findById(req.params.id);
    if (!customer || customer.role !== 'customer' || customer.deleted === true) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    const body = req.body || {};
    const fullName = String(body.fullName || '').trim();
    const email = normalizeMobileEmail(body.email);
    const phone = normalizePhoneNumber(body.phone);
    const requestedGovernorate = String(body.governorate || '').trim();
    const requestedArea = String(body.area || '').trim();
    const governorate =
      canonicalGovernorate(requestedGovernorate)
      || canonicalGovernorate(requestedArea);
    const publicId = body.publicId === undefined
      ? customer.publicId
      : String(body.publicId || '').trim();

    if (fullName.length < 2 || fullName.length > 120) {
      return res.json({ success: false, message: 'الاسم يجب أن يكون بين حرفين و120 حرفاً.' });
    }
    if (!isValidMobileEmail(email)) {
      return res.json({ success: false, message: 'البريد الإلكتروني غير صالح.' });
    }
    if (!isValidPhoneNumber(phone)) {
      return res.json({ success: false, message: INVALID_PHONE_MESSAGE });
    }
    if (!governorate || !requestedArea || !isValidAreaForGovernorate(governorate, requestedArea)) {
      return res.json({ success: false, message: 'المحافظة أو القرية/المدينة غير صالحة.' });
    }
    if (!publicId || !isValidAdminPublicId(publicId)) {
      return res.json({ success: false, message: 'ID المستخدم يجب أن يتكون من أرقام فقط.' });
    }

    if (email !== customer.email) {
      const owner = await findActiveAccountByEmail(email);
      if (owner && !owner._id.equals(customer._id)) {
        return res.json({ success: false, message: 'البريد الإلكتروني مستخدم في حساب آخر.' });
      }
    }
    if (publicId !== customer.publicId) {
      const owner = await findActiveAccountByPublicId(publicId);
      if (owner && !owner._id.equals(customer._id)) {
        return res.json({ success: false, message: 'هذا الـ ID مستخدم في حساب آخر.' });
      }
    }

    const updated = await User.findByIdAndUpdate(
      customer._id,
      {
        $set: {
          fullName,
          name: fullName,
          email,
          phoneNumbers: replacePrimaryPhone(customer.phoneNumbers, phone),
          area: requestedArea,
          governorate,
          publicId,
        },
      },
      { new: true, runValidators: true },
    ).lean();

    res.json({
      success: true,
      message: 'تم تحديث بيانات المستخدم بنجاح.',
      user: {
        _id: updated._id.toString(),
        fullName: updated.fullName,
        email: updated.email,
        phone,
        area: updated.area,
        governorate: updated.governorate,
        publicId: updated.publicId || '',
      },
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.json({ success: false, message: 'البريد الإلكتروني أو الـ ID مستخدم بالفعل.' });
    }
    sendInternalServerFailure(res);
  }
});

router.put('/:id/status', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'customer') return res.json({ success: false, message: 'المستخدم غير موجود' });

    const newStatus = req.body.status === 'active' ? 'active' : 'blocked';
    const statusChanged =
      user.status !== newStatus;

    if (statusChanged) {
      const rotationFilter =
        mobileSessionRotationFilter(user);

      if (!rotationFilter) {
        throw new Error(
          'Invalid mobile session version',
        );
      }

      const rotation =
        await User.updateOne(
          {
            _id: user._id,
            role: 'customer',
            ...rotationFilter,
          },
          {
            $set: {
              status: newStatus,
            },
            $inc: {
              sessionVersion: 1,
            },
          },
          {
            runValidators: true,
          },
        );

      if (rotation.matchedCount !== 1) {
        throw new Error(
          'Concurrent account-state rotation',
        );
      }
    }

    const io = req.app.get('io');

    if (io) {
      const shouldDisconnect =
        statusChanged
        || newStatus === 'blocked';

      try {
        if (statusChanged) {
          if (newStatus === 'blocked') {
            await Notification.create({
              userId: user._id, type: 'broadcast', pinned: true,
              title: 'تم تجميد حسابك',
              body: 'تم تجميد حسابك بسبب كثرة البلاغات. يرجى التواصل مع فريق الدعم.',
              expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            });

            io.to(`user:${user._id}`).emit(
              'notification_count',
              { unreadCount: 1 },
            );

            io.to(`user:${user._id}`).emit('broadcast', {
              title: 'تم تجميد حسابك',
              body: 'تم تجميد حسابك بسبب كثرة البلاغات. يرجى التواصل مع فريق الدعم.',
              action: 'contact_support',
            });
          } else {
            await Notification.create({
              userId: user._id, type: 'broadcast', pinned: true,
              title: 'تم تفعيل حسابك',
              body: 'مبروك! تم إعادة تفعيل حسابك بنجاح. يمكنك الآن استخدام التطبيق بشكل طبيعي.',
              expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            });

            io.to(`user:${user._id}`).emit(
              'notification_count',
              { unreadCount: 1 },
            );

            io.to(`user:${user._id}`).emit('broadcast', {
              title: 'تم تفعيل حسابك',
              body: 'مبروك! تم إعادة تفعيل حسابك بنجاح.',
              action: '',
            });
          }
        }
      } finally {
        if (shouldDisconnect) {
          io.in(`user:${user._id}`)
            .disconnectSockets(true);
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

router.put('/:id/password', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role === 'admin') return res.json({ success: false, message: 'المستخدم غير موجود' });

    const password =
      typeof req.body?.password === 'string'
        ? req.body.password
        : '';

    const confirmPassword =
      typeof req.body?.confirmPassword === 'string'
        ? req.body.confirmPassword
        : '';

    if (!password || !confirmPassword) {
      return res.json({
        success: false,
        message: 'كلمة المرور الجديدة وتأكيدها مطلوبان',
        code: 'PASSWORD_FIELDS_REQUIRED',
      });
    }

    if (!isValidMobilePassword(password)) {
      return res.json({
        success: false,
        message:
          `كلمة المرور الجديدة يجب أن تكون بين ${MIN_MOBILE_PASSWORD_LENGTH} و${MAX_MOBILE_PASSWORD_LENGTH} حرفاً وألا تكون كلمة افتراضية واضحة`,
        code: 'PASSWORD_POLICY',
      });
    }

    if (password !== confirmPassword) {
      return res.json({
        success: false,
        message: 'كلمة المرور وتأكيدها غير متطابقين',
        code: 'PASSWORD_CONFIRMATION_MISMATCH',
      });
    }

    const hashedPassword =
      await bcrypt.hash(
        password,
        10,
      );

    const rotationFilter =
      mobileSessionRotationFilter(user);

    if (!rotationFilter) {
      throw new Error(
        'Invalid mobile session version',
      );
    }

    const rotation =
      await User.updateOne(
        {
          _id: user._id,
          role: user.role,
          ...rotationFilter,
        },
        {
          $set: {
            password: hashedPassword,
            mustChangePassword: true,
          },
          $inc: {
            sessionVersion: 1,
          },
        },
        {
          runValidators: true,
        },
      );

    if (rotation.matchedCount !== 1) {
      throw new Error(
        'Concurrent credential rotation',
      );
    }

    const io = req.app.get('io');

    if (io) {
      io.in(`user:${user._id}`)
        .disconnectSockets(true);
    }

    res.json({
      success: true,
      message:
        'تم تغيير كلمة المرور بنجاح. سيُطلب من المستخدم تغييرها عند أول تسجيل دخول.',
    });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.json({ success: false, message: 'المستخدم غير موجود' });
    }
    const account = await User.findById(req.params.id);
    if (!account || account.role !== 'customer') {
      return res.json({ success: false, message: 'المستخدم غير موجود' });
    }

    // Removes the account and its personal data from the database, so the
    // same email, phone and ID can be used again (see accountDeletion.js).
    await permanentlyDeleteAccount(account, { io: req.app.get('io') });

    res.json({
      success: true,
      message: `تم حذف المستخدم (${account.fullName}) نهائياً من قاعدة البيانات`,
    });
  } catch (err) {
    if (err instanceof AccountDeletionBlockedError) {
      return res.json({ success: false, code: err.code, message: err.message });
    }
    sendInternalServerFailure(res);
  }
});

module.exports = router;
