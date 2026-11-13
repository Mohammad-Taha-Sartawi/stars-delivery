const { sendInternalServerError } = require('../security/errorResponse');
const express = require('express');
const mongoose = require('mongoose');
const Offer = require('../models/Offer');
const Order = require('../models/Order');
const Rating = require('../models/Rating');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const lifecycle = require('../services/orderLifecycle');
const {
  offerCreateLimiter,
  offerCreateIpLimiter,
  orderCreateLimiter,
  orderCreateIpLimiter,
} = require('../security/actionRateLimit');
const {
  boundedTrimmedString,
  boundedFiniteNumber,
} = require('../security/requestInput');
const {
  resolveRegistrationLocation,
} = require('../services/registrationLocation');
const {
  createUserNotification,
} = require('../services/mobileNotifications');
const {
  getCommissionConfig,
} = require('../services/commissionSettings');
const {
  driverCategoryForProvider,
} = require('../services/providerServiceTypes');

const router = express.Router();

async function notifyOfferNotSelected(io, providerId, orderId, price) {
  if (io) {
    io.to(`user:${providerId}`).emit('offer_not_selected', {
      orderId,
      price,
    });
  }

  await createUserNotification({
    io,
    userId: providerId,
    orderId,
    type: 'offer_not_selected',
    title: 'تم اختيار سائق آخر',
    body: `تم قبول عرض سائق آخر لهذا الطلب بقيمة ${price} شيكل.`,
    expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  }).catch(() => {});
}

async function notifyDriverTaken(io, customerId, orderId, offerId, providerId) {
  if (io) {
    io.to(`user:${customerId}`).emit('offer_cancelled', {
      orderId,
      offerId,
      providerId,
    });
  }

  await createUserNotification({
    io,
    userId: customerId,
    orderId,
    type: 'driver_taken',
    title: 'السائق لم يعد متاحاً',
    body:
      'قام السائق بقبول طلب آخر، لذلك تم إلغاء عرض سعره. يمكنك إعادة إرسال الطلب أو الموافقة على عرض سائق آخر.',
    expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  }).catch(() => {});
}

router.post('/', auth, requireRole('provider'), offerCreateLimiter, offerCreateIpLimiter, async (req, res) => {
  try {
    const orderId = boundedTrimmedString(req.body?.orderId, 50);
    const price = boundedFiniteNumber(req.body?.price, {
      min: 0.01,
      max: 100000,
    });
    const estimatedTime = req.body?.estimatedTime === undefined
      ? 0
      : boundedFiniteNumber(req.body?.estimatedTime, {
          min: 0,
          max: 1440,
        });

    if (
      !orderId
      || !mongoose.isValidObjectId(orderId)
      || price === null
      || estimatedTime === null
    ) {
      return res.status(400).json({
        error: 'Valid price is required',
        code: 'INVALID_OFFER_INPUT',
      });
    }

    const result = await lifecycle.submitOffer({
      orderId,
      providerId: req.userId,
      price,
      estimatedTime: Math.round(estimatedTime),
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${result.customerId}`).emit('new_offer', {
        orderId,
        offerId: result.offer._id,
        price,
        estimatedTime: Math.round(estimatedTime),
        providerName: result.providerName,
        providerPhone: result.providerPhone,
      });
    }

    await createUserNotification({
      io,
      userId: result.customerId,
      orderId,
      type: 'new_offer',
      title: 'عرض سعر جديد',
      body: `قدم ${result.providerName} عرض سعر بقيمة ${price} شيكل.`,
      expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).catch(() => {});

    res.status(201).json(result.offer);
  } catch (err) {
    if (err instanceof lifecycle.LifecycleConflict) return res.status(409).json(lifecycle.conflictResponse(err));
    if (lifecycle.isTransactionUnavailable(err)) return res.status(503).json({ error: 'Order service is temporarily unavailable' });
    console.error('Create offer error:', err.message);
    sendInternalServerError(res);
  }
});

// Resend rejected order to other providers
router.post('/:orderId/resend', auth, requireRole('customer'), orderCreateLimiter, orderCreateIpLimiter, async (req, res) => {
  try {
    const order = await lifecycle.resetOrder({ orderId: req.params.orderId, customerId: req.userId });

    const io = req.app.get('io');
    if (io && order) {
      const phone = order.phone || '';
      const payload = {
        _id: order._id,
        type: order.type,
        description: order.description,
        area: order.area,
        governorate: order.governorate,
        governorateLevel: order.governorateLevel,
        location: order.location,
        status: order.status,
        createdAt: order.createdAt,
        phoneMasked: phone.length > 3 ? `${phone.slice(0, -3)}***` : '***',
      };
      const areaRoom = `area:${order.area || ''}`;
      if (order.governorate) {
        const governorateRoom = `governorate:${order.governorate}`;
        io.to(areaRoom).except(governorateRoom).emit('new_order', payload);
        io.to(governorateRoom).emit('new_order', payload);
      } else {
        io.to(areaRoom).emit('new_order', payload);
      }
    }

    res.json({ success: true, message: 'تم إعادة إرسال الطلب لمزودي الخدمة الآخرين' });
  } catch (err) {
    if (err instanceof lifecycle.LifecycleConflict) return res.status(409).json(lifecycle.conflictResponse(err));
    if (lifecycle.isTransactionUnavailable(err)) return res.status(503).json({ error: 'Order service is temporarily unavailable' });
    sendInternalServerError(res);
  }
});

// Cancel order (hide from reports but keep in DB)
router.post('/:orderId/cancel', auth, requireRole('customer'), async (req, res) => {
  try {
    await lifecycle.cancelOrder({ orderId: req.params.orderId, customerId: req.userId });

    res.json({ success: true, message: 'تم إلغاء الطلب' });
  } catch (err) {
    if (err instanceof lifecycle.LifecycleConflict) return res.status(409).json(lifecycle.conflictResponse(err));
    if (lifecycle.isTransactionUnavailable(err)) return res.status(503).json({ error: 'Order service is temporarily unavailable' });
    sendInternalServerError(res);
  }
});

router.get('/order/:orderId', auth, requireRole('customer'), async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      customerId: req.userId,
    }).select('_id area governorate').lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await lifecycle.expireStaleOffers({ orderId: order._id });
    await lifecycle.finalizeExpiredOrders({ orderId: order._id });

    const offers = await Offer.find({ orderId: req.params.orderId })
      .populate('providerId', 'fullName phone area governorate publicId serviceTypes licenseType')
      .populate('orderId', 'description area type')
      .sort({ createdAt: -1 })
      .lean();

    const providerIds = offers
      .map((offer) => offer.providerId?._id)
      .filter(Boolean);

    const ratingRows = providerIds.length > 0
      ? await Rating.aggregate([
          {
            $match: {
              providerId: { $in: providerIds },
            },
          },
          {
            $group: {
              _id: '$providerId',
              count: { $sum: 1 },
              stars: { $sum: '$rating' },
              positiveCount: {
                $sum: {
                  $cond: [
                    { $gte: ['$rating', 4] },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
      : [];

    const ratingByProvider = new Map(
      ratingRows.map((row) => [
        row._id.toString(),
        row,
      ]),
    );

    const orderArea = (order.area || '').trim();
    res.json(offers.map((offer) => {
      const provider = offer.providerId || {};
      const providerArea = (provider.area || '').trim();
      const providerLocation = resolveRegistrationLocation(provider);
      const rating = ratingByProvider.get(
        provider._id?.toString() || '',
      ) || {};
      const ratingCount = rating.count || 0;
      const ratingStars = rating.stars || 0;

      return {
        ...offer,
        outsideArea: Boolean(
          orderArea
          && providerArea
          && orderArea !== providerArea,
        ),
        providerArea,
        providerCity: providerLocation.city,
        providerGovernorate: providerLocation.governorate,
        providerCategory: driverCategoryForProvider(provider),
        providerRating: {
          average: ratingCount > 0
            ? Math.round((ratingStars / ratingCount) * 10) / 10
            : 0,
          count: ratingCount,
          positiveCount: rating.positiveCount || 0,
          stars: ratingStars,
        },
      };
    }));
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.post('/:id/accept', auth, requireRole('customer'), async (req, res) => {
  try {
    const commissionConfig = await getCommissionConfig();
    const result = await lifecycle.acceptOffer({
      offerId: req.params.id,
      customerId: req.userId,
      commissionConfig,
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${result.providerId}`).emit('offer_accepted', {
        orderId: result.orderId,
        price: result.price,
      });
    }

    await createUserNotification({
      io,
      userId: result.providerId,
      orderId: result.orderId,
      type: 'offer_accepted',
      title: 'تم قبول عرضك',
      body: 'قبل الزبون عرض السعر الخاص بك. يمكنك بدء تنفيذ الطلب.',
      expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).catch(() => {});

    for (const providerId of result.competingProviderIds || []) {
      await notifyOfferNotSelected(
        io,
        providerId,
        result.orderId,
        result.price,
      );
    }

    for (const affected of result.unavailableOffers || []) {
      await notifyDriverTaken(
        io,
        affected.customerId,
        affected.orderId,
        affected.offerId,
        result.providerId,
      );
    }

    res.json({ message: 'Offer accepted' });
  } catch (err) {
    if (err instanceof lifecycle.LifecycleConflict) {
      if (err.code === 'PROVIDER_TAKEN' && err.offerJustCancelled) {
        try {
          const order = await Order.findById(err.orderId)
            .select('customerId')
            .lean();
          if (order?.customerId) {
            await notifyDriverTaken(
              req.app.get('io'),
              order.customerId,
              err.orderId,
              err.offerId,
              err.providerId,
            );
          }
        } catch (_) {}
      }
      return res.status(409).json(lifecycle.conflictResponse(err));
    }
    if (lifecycle.isTransactionUnavailable(err)) return res.status(503).json({ error: 'Order service is temporarily unavailable' });
    console.error('Accept offer error:', err.message);
    sendInternalServerError(res);
  }
});

module.exports = router;