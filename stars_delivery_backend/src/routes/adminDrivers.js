const fs = require('fs/promises');
const mongoose = require('mongoose');
const {
  PROVIDER_DOCUMENT_KINDS,
  deleteProviderDocuments,
  requiredProviderDocumentsPresent,
  findProviderDocument,
  providerDocumentMetadata,
  providerDocumentPath,
  providerDocumentDownloadName,
} = require('../services/providerDocumentStorage');
const { executeTransaction } = require('../services/transaction');
const { serviceTypesFromAdminLabel, serviceTypesLabel } = require('../services/providerServiceTypes');
const { sendInternalServerError, sendInternalServerFailure } = require('../security/errorResponse');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const RejectedOrder = require('../models/RejectedOrder');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const PendingProvider = require('../models/PendingProvider');
const { generatePublicId } = require('../utils/publicId');
const {
  MIN_MOBILE_PASSWORD_LENGTH,
  MAX_MOBILE_PASSWORD_LENGTH,
  MIN_PROVIDER_BOOTSTRAP_PASSWORD_LENGTH,
  isValidMobilePassword,
  isValidProviderBootstrapPassword,
} = require('../security/passwordPolicy');
const {
  mobileSessionRotationFilter,
} = require('../services/mobileSession');

const upload = multer();

router.put('/:id/availability', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'السائق غير موجود' });
    }

    const available = req.body?.available;

    if (typeof available !== 'boolean') {
      return res.status(400).json({ success: false, message: 'حالة التوفر غير صالحة' });
    }

    const driver = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        role: 'provider',
        deleted: { $ne: true },
      },
      { $set: { isAvailable: available } },
      { new: true },
    ).select('isAvailable').lean();

    if (!driver) {
      return res.status(404).json({ success: false, message: 'السائق غير موجود' });
    }

    res.json({
      success: true,
      isAvailable: driver.isAvailable !== false,
    });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

router.get('/:id/reports', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'السائق غير موجود' });
    }

    const provider = await User.findOne({
      _id: req.params.id,
      role: 'provider',
    }).select('fullName publicId').lean();

    if (!provider) {
      return res.status(404).json({ error: 'السائق غير موجود' });
    }

    const now = new Date();
    const [rejections, deliveredOrders] = await Promise.all([
      RejectedOrder.find({
        providerId: provider._id,
        createdAt: { $lte: now },
      }).sort({ createdAt: -1 }).lean(),
      Order.find({
        providerId: provider._id,
        status: 'completed',
      }).populate('customerId', 'fullName publicId').lean(),
    ]);

    const orderIds = rejections.map((rejection) => rejection.orderId);
    const orders = await Order.find({
      _id: { $in: orderIds },
    }).populate('customerId', 'fullName publicId').lean();
    const orderMap = new Map(orders.map((order) => [order._id.toString(), order]));

    const maskPhone = (phone) => (
      phone ? `${phone.slice(0, -3)}***` : ''
    );

    const rejected = rejections
      .map((rejection) => {
        const order = orderMap.get(rejection.orderId.toString());
        if (!order) return null;
        return {
          ...order,
          recordType: 'rejected',
          reason: rejection.reason || 'driver_rejected',
          reportAt: rejection.createdAt,
          phone: maskPhone(order.phone),
        };
      })
      .filter(Boolean);

    const delivered = deliveredOrders.map((order) => ({
      ...order,
      recordType: 'delivered',
      reportAt: order.completedAt || order.createdAt,
    }));

    res.json({
      provider: {
        name: provider.fullName,
        publicId: provider.publicId,
      },
      report: [...rejected, ...delivered].sort(
        (a, b) => new Date(b.reportAt) - new Date(a.reportAt),
      ),
    });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

router.get('/', async (req, res) => {
  try {
    const drivers = await User.find({ role: 'provider' })
      .select('fullName publicId email phoneNumbers area status isAvailable serviceTypes licenseType blockedUntil offerCooldownUntil createdAt deleted')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json(drivers.map((driver) => ({
      _id: driver._id.toString(),
      fullName: driver.fullName,
      publicId: driver.publicId || '',
      email: driver.email || '',
      phone:
        driver.phoneNumbers?.find((phone) => phone.primary)?.number
        || driver.phoneNumbers?.[0]?.number
        || '',
      area: driver.area || '',
      status: driver.status || '',
      isAvailable: driver.isAvailable !== false,
      serviceTypes: driver.serviceTypes || [],
      licenseType: driver.licenseType || '',
      blockedUntil: driver.blockedUntil || null,
      offerCooldownUntil: driver.offerCooldownUntil || null,
      createdAt: driver.createdAt,
      deleted: driver.deleted === true,
    })));
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.get('/search', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.json({ error: 'الرجاء إدخال رقم السائق أو الاسم' });

    const searchTerms = [
      { publicId: id },
      { fullName: { $regex: id, $options: 'i' } },
    ];

    if (mongoose.isValidObjectId(id)) {
      searchTerms.push({ _id: id });
    }

    const match = await User.findOne({
      role: 'provider',
      $or: searchTerms,
    }).lean();

    if (!match) return res.json({ error: 'لم يتم العثور على سائق' });

    const orders = await Order.find({
      providerId: match._id,
      status: { $in: ['accepted', 'fulfilling', 'completed'] },
    }).lean();
    const orderCount = orders.length;
    const netProfit = orders.reduce((s, o) => s + (o.providerEarning || 0), 0);
    const totalCommission = orders.reduce((s, o) => s + (o.platformCommission || 0), 0);

    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentOrders = orders.filter(o => new Date(o.createdAt) >= thirtyDaysAgo);
    const last30Profit = recentOrders.reduce((s, o) => s + (o.providerEarning || 0), 0);

    const driver = {
      _id: match._id.toString(),
      driverId: match.publicId || match._id.toString().slice(-8),
      name: match.fullName || match.name,
      email: match.email,
      phone:
        match.phoneNumbers?.find((phone) => phone.primary)?.number
        || match.phoneNumbers?.[0]?.number
        || match.phone
        || '',
      serviceType: serviceTypesLabel(match.serviceTypes),
      serviceTypes: match.serviceTypes || [],
      licenseType: match.licenseType || 'غير محدد',
      isAvailable: match.isAvailable !== false,
      blockedUntil: match.blockedUntil || null,
      offerCooldownUntil: match.offerCooldownUntil || null,
      area: match.area || 'غير محدد',
      status: match.status === 'blocked' ? 'inactive' : match.status,
      financial: {
        paymentStatus: 'unpaid',
        transactions: orders.map(o => ({
          id: o._id.toString(),
          desc: `طلب #${o._id.toString().slice(-8)}`,
          amount: o.providerEarning || 0,
          date: o.createdAt.toISOString().split('T')[0]
        }))
      }
    };

    res.json({ driver, orderCount, commission: totalCommission, netProfit, last30Profit, totalCommission });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      driverName,
      driverEmail,
      driverPhone,
      driverServiceType,
      driverLicenseType,
      driverArea,
      driverPassword,
      driverPasswordConfirm,
    } = req.body;

    const password =
      typeof driverPassword === 'string'
        ? driverPassword
        : '';

    const passwordConfirm =
      typeof driverPasswordConfirm === 'string'
        ? driverPasswordConfirm
        : '';

    if (
      !driverName
      || !driverEmail
      || !driverPhone
      || !password
      || !passwordConfirm
    ) {
      return res.json({
        success: false,
        message: 'الرجاء ملء جميع الحقول المطلوبة',
      });
    }

    if (password !== passwordConfirm) {
      return res.json({
        success: false,
        message: 'كلمتا المرور غير متطابقتين',
      });
    }

    if (!isValidProviderBootstrapPassword(password)) {
      return res.json({
        success: false,
        message: `كلمة المرور الأولية يجب أن تكون بين ${MIN_PROVIDER_BOOTSTRAP_PASSWORD_LENGTH} و128 حرفاً وألا تكون كلمة افتراضية واضحة`,
      });
    }

    const exists =
      await User.findOne({
        email: driverEmail.toLowerCase(),
      });

    if (exists) {
      return res.json({
        success: false,
        message: 'البريد الإلكتروني مسجل بالفعل',
      });
    }

    const hashedPassword =
      await bcrypt.hash(
        password,
        10,
      );

    const publicId =
      await generatePublicId();

    const user =
      new User({
        fullName: driverName,
        name: driverName,
        email: driverEmail.toLowerCase(),
        phoneNumbers: [
          {
            number: driverPhone,
            primary: true,
          },
        ],
        password: hashedPassword,
        role: 'provider',
        area: driverArea || '',
        serviceTypes: serviceTypesFromAdminLabel(driverServiceType),
        licenseType: driverLicenseType || '',
        status: 'active',
        publicId,
      });

    await user.save();

    res.json({
      success: true,
      message: `تم إضافة السائق (${driverName}) بنجاح!`,
    });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

router.put('/:id/status', async (req, res) => {
  try {
    const driver = await User.findById(req.params.id);
    if (!driver || driver.role !== 'provider') return res.json({ success: false, message: 'السائق غير موجود' });

    const newStatus = req.body.status === 'active' ? 'active' : 'blocked';
    const statusChanged =
      driver.status !== newStatus;

    if (statusChanged) {
      const rotationFilter =
        mobileSessionRotationFilter(driver);

      if (!rotationFilter) {
        throw new Error(
          'Invalid mobile session version',
        );
      }

      const rotation =
        await User.updateOne(
          {
            _id: driver._id,
            role: 'provider',
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
              userId: driver._id, type: 'broadcast', pinned: true,
              title: 'تم تجميد حسابك',
              body: 'تم تجميد حسابك بسبب كثرة البلاغات. يرجى التواصل مع فريق الدعم.',
              expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            });

            io.to(`user:${driver._id}`).emit(
              'notification_count',
              { unreadCount: 1 },
            );

            io.to(`user:${driver._id}`).emit('broadcast', {
              title: 'تم تجميد حسابك',
              body: 'تم تجميد حسابك بسبب كثرة البلاغات. يرجى التواصل مع فريق الدعم.',
              action: 'contact_support',
            });
          } else {
            await Notification.create({
              userId: driver._id, type: 'broadcast', pinned: true,
              title: 'تم تفعيل حسابك',
              body: 'مبروك! تم إعادة تفعيل حسابك بنجاح. يمكنك الآن استخدام التطبيق بشكل طبيعي.',
              expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            });

            io.to(`user:${driver._id}`).emit(
              'notification_count',
              { unreadCount: 1 },
            );

            io.to(`user:${driver._id}`).emit('broadcast', {
              title: 'تم تفعيل حسابك',
              body: 'مبروك! تم إعادة تفعيل حسابك بنجاح.',
              action: '',
            });
          }
        }
      } finally {
        if (shouldDisconnect) {
          io.in(`user:${driver._id}`)
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
    const driver = await User.findById(req.params.id);
    if (!driver || driver.role !== 'provider') return res.json({ success: false, message: 'السائق غير موجود' });

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
      mobileSessionRotationFilter(driver);

    if (!rotationFilter) {
      throw new Error(
        'Invalid mobile session version',
      );
    }

    const rotation =
      await User.updateOne(
        {
          _id: driver._id,
          role: 'provider',
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
      io.in(`user:${driver._id}`)
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
    const driver = await User.findById(req.params.id);
    if (!driver || driver.role !== 'provider') return res.json({ success: false, message: 'السائق غير موجود' });

    const stateChanged =
      driver.deleted !== true
      || driver.status !== 'blocked';

    if (stateChanged) {
      const rotationFilter =
        mobileSessionRotationFilter(driver);

      if (!rotationFilter) {
        throw new Error(
          'Invalid mobile session version',
        );
      }

      const rotation =
        await User.updateOne(
          {
            _id: driver._id,
            role: 'provider',
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
        io.to(`user:${driver._id}`)
          .emit('account_deleted', {});
      } finally {
        io.in(`user:${driver._id}`)
          .disconnectSockets(true);
      }
    }

    res.json({ success: true, message: `تم حذف السائق (${driver.fullName}) بنجاح` });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});


async function sendStoredProviderDocument(
  res,
  documents,
  kind,
) {
  if (
    !PROVIDER_DOCUMENT_KINDS
      .includes(kind)
  ) {
    return res.status(404).json({
      error:
        'Provider document not found',
    });
  }

  const document =
    findProviderDocument(
      documents,
      kind,
    );

  if (!document) {
    return res.status(404).json({
      error:
        'Provider document not found',
    });
  }

  let filePath;

  try {
    filePath =
      providerDocumentPath(
        document.storageKey,
      );

    await fs.access(filePath);
  } catch (_) {
    return res.status(404).json({
      error:
        'Provider document not found',
    });
  }

  res.set({
    'Cache-Control':
      'private, no-store, max-age=0',
    Pragma:
      'no-cache',
    'X-Content-Type-Options':
      'nosniff',
    'Content-Security-Policy':
      "default-src 'none'; sandbox",
    'Content-Type':
      document.contentType,
    'Content-Disposition':
      `attachment; filename="${providerDocumentDownloadName(
        document.kind,
        document.contentType,
      )}"`,
  });

  return res.sendFile(filePath);
}

router.get(
  '/pending/:id/documents',
  async (req, res) => {
    try {
      const pending =
        await PendingProvider
          .findById(req.params.id)
          .select(
            '+providerDocuments',
          )
          .lean();

      if (!pending) {
        return res.status(404).json({
          error:
            'Pending provider not found',
        });
      }

      return res.json({
        documents:
          (pending.providerDocuments || [])
            .map(
              providerDocumentMetadata,
            ),
        complete:
          requiredProviderDocumentsPresent(
            pending.providerDocuments,
          ),
      });
    } catch (_) {
      return sendInternalServerError(res);
    }
  },
);

router.get(
  '/pending/:id/documents/:kind',
  async (req, res) => {
    try {
      const pending =
        await PendingProvider
          .findById(req.params.id)
          .select(
            '+providerDocuments',
          )
          .lean();

      if (!pending) {
        return res.status(404).json({
          error:
            'Pending provider not found',
        });
      }

      return sendStoredProviderDocument(
        res,
        pending.providerDocuments,
        req.params.kind,
      );
    } catch (_) {
      return sendInternalServerError(res);
    }
  },
);

router.get(
  '/documents/:id',
  async (req, res) => {
    try {
      const provider =
        await User
          .findOne({
            _id: req.params.id,
            role: 'provider',
          })
          .select(
            '+providerDocuments',
          )
          .lean();

      if (!provider) {
        return res.status(404).json({
          error:
            'Provider not found',
        });
      }

      return res.json({
        documents:
          (provider.providerDocuments || [])
            .map(
              providerDocumentMetadata,
            ),
        complete:
          requiredProviderDocumentsPresent(
            provider.providerDocuments,
          ),
      });
    } catch (_) {
      return sendInternalServerError(res);
    }
  },
);

router.get(
  '/documents/:id/:kind',
  async (req, res) => {
    try {
      const provider =
        await User
          .findOne({
            _id: req.params.id,
            role: 'provider',
          })
          .select(
            '+providerDocuments',
          )
          .lean();

      if (!provider) {
        return res.status(404).json({
          error:
            'Provider not found',
        });
      }

      return sendStoredProviderDocument(
        res,
        provider.providerDocuments,
        req.params.kind,
      );
    } catch (_) {
      return sendInternalServerError(res);
    }
  },
);

// Pending Provider Signups
router.get('/pending', async (req, res) => {
  try {
    const pending = await PendingProvider.find().sort({ createdAt: -1 }).lean();
    res.json(pending);
  } catch (err) {
    sendInternalServerError(res);
  }
});

// Historical fake document route intentionally disabled.
router.post(
  '/pending/:id',
  upload.none(),
  (req, res) => {
    return res.status(410).json({
      success: false,
      message:
        'تم إيقاف مسار إدخال الوثائق القديم. يجب مراجعة وثائق التسجيل المرفوعة من تطبيق المزود.',
      code:
        'LEGACY_PROVIDER_DOCUMENT_FLOW_DISABLED',
    });
  },
);

router.post('/pending/:id/approve', async (req, res) => {
  try {
    // Public-ID discovery is read-only. The unique User.publicId
    // index remains the final concurrency boundary.
    const publicId =
      await generatePublicId();

    const approvalResult =
      await executeTransaction({
        startSession:
          () => mongoose.startSession(),

        work:
          async (session) => {
            const pending =
              await PendingProvider
                .findById(req.params.id)
                .select(
                  '+password +providerDocuments',
                )
                .session(session);

            if (!pending) {
              return {
                outcome:
                  'not_found',
              };
            }

            if (
              !requiredProviderDocumentsPresent(
                pending.providerDocuments,
              )
            ) {
              return {
                outcome:
                  'documents_required',
              };
            }

            await User.create(
              [{
                fullName:
                  pending.fullName,
                email:
                  pending.email,
                phoneNumbers: [{
                  number:
                    pending.phone,
                  primary:
                    true,
                }],
                password:
                  pending.password,
                role:
                  'provider',
                area:
                  pending.area,
                serviceTypes:
                  pending.serviceTypes || [],
                licenseType:
                  pending.licenseType || '',
                publicId,
                primaryPhone:
                  pending.phone,
                status:
                  'active',
                providerDocuments:
                  pending.providerDocuments
                    .map(
                      (document) =>
                        typeof document.toObject
                          === 'function'
                          ? document.toObject()
                          : document,
                    ),
              }],
              {
                session,
              },
            );

            const deletion =
              await PendingProvider
                .deleteOne(
                  {
                    _id:
                      pending._id,
                  },
                  {
                    session,
                  },
                );

            if (
              deletion.deletedCount !== 1
            ) {
              throw new Error(
                'Pending provider approval conflict',
              );
            }

            return {
              outcome:
                'approved',
              fullName:
                pending.fullName,
            };
          },
      });

    if (
      approvalResult.outcome
      === 'not_found'
    ) {
      return res.status(404).json({
        success: false,
        message:
          'طلب التسجيل غير موجود',
      });
    }

    if (
      approvalResult.outcome
      === 'documents_required'
    ) {
      return res.status(400).json({
        success: false,
        message:
          'لا يمكن قبول المزود قبل اكتمال رخصة القيادة.',
        code:
          'PROVIDER_DOCUMENTS_REQUIRED',
      });
    }

    return res.json({
      success: true,
      message:
        `تم قبول السائق (${approvalResult.fullName}) بنجاح`,
    });
  } catch (_) {
    return sendInternalServerFailure(res);
  }
});

router.delete('/pending/:id/reject', async (req, res) => {
    try {
      const pending =
        await PendingProvider
          .findOneAndDelete({
            _id: req.params.id,
          })
          .select(
            '+providerDocuments',
          );

      if (!pending) {
        return res.status(404).json({
          success: false,
          message:
            'طلب التسجيل غير موجود',
        });
      }

      try {
        await deleteProviderDocuments(
          pending.providerDocuments,
        );
      } catch (_) {
        console.error(
          'Provider document cleanup failed after rejection.',
        );
      }

      return res.json({
        success: true,
        message:
          `تم رفض طلب السائق (${pending.fullName})`,
      });
    } catch (_) {
      return sendInternalServerFailure(res);
    }
  },
);

module.exports = router;
