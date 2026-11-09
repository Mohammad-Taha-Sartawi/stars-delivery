const { sendInternalServerError, sendInternalServerFailure } = require('../security/errorResponse');
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Order = require('../models/Order');
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
} = require('../services/registrationLocation');

router.get('/', async (req, res) => {
  try {
    const users = await User.find({ role: 'customer' })
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
      $or: searchTerms,
    }).lean();

    if (!user) return res.json({ error: 'لم يتم العثور على مستخدم' });

    const orders = await Order.find({ customerId: user._id }).lean();
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
      message: 'تم تغيير كلمة المرور بنجاح',
    });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role === 'admin') return res.json({ success: false, message: 'المستخدم غير موجود' });

    const stateChanged =
      user.deleted !== true
      || user.status !== 'blocked';

    if (stateChanged) {
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
              deleted: true,
              status: 'blocked',
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
      try {
        io.to(`user:${user._id}`)
          .emit('account_deleted', {});
      } finally {
        io.in(`user:${user._id}`)
          .disconnectSockets(true);
      }
    }

    res.json({ success: true, message: `تم حذف المستخدم (${user.fullName}) بنجاح` });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

module.exports = router;
