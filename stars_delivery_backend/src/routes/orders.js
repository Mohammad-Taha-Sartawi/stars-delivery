const { sendInternalServerError } = require('../security/errorResponse');
const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Offer = require('../models/Offer');
const RejectedOrder = require('../models/RejectedOrder');
const Rating = require('../models/Rating');
const User = require('../models/User');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const lifecycle = require('../services/orderLifecycle');
const {
  orderCreateLimiter,
  orderCreateIpLimiter,
} = require('../security/actionRateLimit');
const {
  boundedTrimmedString,
  optionalBoundedTrimmedString,
} = require('../security/requestInput');
const {
  governorateKey,
  resolveRegistrationLocation,
} = require('../services/registrationLocation');
const {
  canProviderSeeOrder,
  orderResponderFilter,
} = require('../services/orderVisibility');
const {
  createUserNotification,
} = require('../services/mobileNotifications');
const {
  sendPushToUsers,
} = require('../services/pushNotifications');

const router = express.Router();

function maskedPhone(phone) {
  const value = String(phone || '');

  return value.length > 3
    ? `${value.slice(0, -3)}***`
    : '***';
}

router.post('/', auth, requireRole('customer'), orderCreateLimiter, orderCreateIpLimiter, async (req, res) => {
  try {
    const type = boundedTrimmedString(req.body?.type, 20);
    const description = boundedTrimmedString(req.body?.description, 2000);
    const phone = boundedTrimmedString(req.body?.phone, 30);
    const area = optionalBoundedTrimmedString(req.body?.area, 100);
    const requestedLocation = optionalBoundedTrimmedString(req.body?.location, 500);

    if (
      !type
      || !['product', 'people', 'goods'].includes(type)
      || !description
      || !phone
      || area === null
      || requestedLocation === null
    ) {
      return res.status(400).json({
        error: 'All fields are required',
        code: 'INVALID_ORDER_INPUT',
      });
    }

    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.status === 'blocked' || user.deleted) {
      return res.status(403).json({ error: 'تم تجميد حسابك. يرجى التواصل مع الدعم.' });
    }

    // Registered area is authoritative; GPS-detected area is a fallback only
    const orderArea = user.area || area || '';
    const orderGovernorate = governorateKey(user);
    // Scope is the driver's choice; customers no longer have a governorate
    // setting, so new orders never carry one.
    const orderGovernorateLevel = false;
    console.log(`[CREATE] data received — area="${orderArea}" (reqBody="${area}") userArea="${user.area}" governorate="${orderGovernorate}" governorateLevel=${orderGovernorateLevel}`);

    const order = await Order.create({
      customerId: req.userId,
      type,
      description,
      phone,
      area: orderArea,
      governorate: orderGovernorate,
      governorateLevel: orderGovernorateLevel,
      location: requestedLocation,
    });
    console.log(`[CREATE] saved order=${order._id} status=${order.status}`);

    // Emit a real-time event to providers who can see this order. A
    // governorate-level order also reaches providers across the governorate.
    // Never include the full customer phone in this broadcast.
    const io = req.app.get('io');
    if (io) {
      const {
        _id,
        type: orderType,
        description: orderDescription,
        area: oArea,
        governorate: oGovernorate,
        governorateLevel: oGovernorateLevel,
        location: oLocation,
        status,
        createdAt,
      } = order.toObject();
      const payload = {
        _id,
        type: orderType,
        description: orderDescription,
        area: oArea,
        governorate: oGovernorate,
        governorateLevel: oGovernorateLevel,
        location: oLocation,
        status,
        createdAt,
        phoneMasked: maskedPhone(order.phone),
      };
      const areaRoom = `area:${orderArea || ''}`;
      // Governorate-level drivers sit in the governorate room; reach them
      // too, without sending the same-village drivers a duplicate.
      if (orderGovernorate) {
        const governorateRoom = `governorate:${orderGovernorate}`;
        io.to(areaRoom).except(governorateRoom).emit('new_order', payload);
        io.to(governorateRoom).emit('new_order', payload);
      } else {
        io.to(areaRoom).emit('new_order', payload);
      }
    }

    const pushAnd = [
      {
        $or: [
          { blockedUntil: null },
          { blockedUntil: { $exists: false } },
          { blockedUntil: { $lte: new Date() } },
        ],
      },
      {
        $or: [
          { serviceTypes: { $exists: false } },
          { serviceTypes: { $size: 0 } },
          { serviceTypes: order.type },
        ],
      },
    ];
    const responderVisibility = orderResponderFilter(order);
    if (responderVisibility) {
      pushAnd.push(responderVisibility);
    }
    const eligibleDrivers = await User.find({
      role: 'provider',
      status: 'active',
      deleted: { $ne: true },
      isAvailable: { $ne: false },
      $and: pushAnd,
    })
      .select('_id')
      .lean();

    sendPushToUsers(
      eligibleDrivers.map((driver) => driver._id),
      {
        title: 'طلب جديد',
        body: `${order.description || 'طلب جديد'} — ${order.area || ''}`.trim(),
        data: {
          type: 'new_order',
          orderId: order._id.toString(),
        },
      },
    ).catch(() => {});

    res.status(201).json(order.toObject());
  } catch (err) {
    console.error('Create order error:', err.message);
    sendInternalServerError(res);
  }
});

router.get('/', auth, requireRole('customer'), async (req, res) => {
  try {
    await lifecycle.expireStaleOffers();
    await lifecycle.finalizeExpiredOrders();

    const orders = await Order.find({ customerId: req.userId, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).lean();

    for (const order of orders) {
      if (
        order.status === 'pending'
        && !order.offerSuspendedUntil
        && !order.offerWindowExpiredAt
      ) {
        const suspended = await lifecycle.suspendIfUnanswered(order);

        if (suspended) {
          order.offerWindowExpiredAt = suspended.offerWindowExpiredAt;
          order.offerSuspendedUntil = suspended.offerSuspendedUntil;
        }
      }
    }

    if (orders.length > 0) {
      const ratings = await Rating.find({
        customerId: req.userId,
        orderId: { $in: orders.map((order) => order._id) },
      })
        .select('orderId rating comment createdAt')
        .lean();
      const ratingMap = new Map(
        ratings.map((rating) => [rating.orderId.toString(), rating]),
      );

      for (const order of orders) {
        const rating = ratingMap.get(order._id.toString());
        order.myRating = rating
          ? {
              rating: rating.rating,
              comment: rating.comment || '',
              createdAt: rating.createdAt,
            }
          : null;
      }
    }

    res.json(orders);
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Order not found' });
    }

    await lifecycle.expireStaleOffers({ orderId: req.params.id });
    await lifecycle.finalizeExpiredOrders({ orderId: req.params.id });

    const order = await Order.findById(req.params.id)
      .populate('customerId', 'fullName publicId')
      .lean();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const customerId = order.customerId?._id?.toString()
      || order.customerId?.toString();
    const isCustomer = req.userRole === 'customer' && customerId === req.userId;
    const isAssignedProvider = req.userRole === 'provider'
      && order.providerId?.toString() === req.userId;
    const isAvailableProvider = req.userRole === 'provider'
      && ['pending', 'offered'].includes(order.status)
      && canProviderSeeOrder(req.authUser, order);

    if (!isCustomer && !isAssignedProvider && !isAvailableProvider) {
      return res.status(403).json({ error: 'Order not available' });
    }

    if (
      isCustomer
      && order.status === 'pending'
      && !order.offerSuspendedUntil
      && !order.offerWindowExpiredAt
    ) {
      const suspended = await lifecycle.suspendIfUnanswered(order);

      if (suspended) {
        order.offerWindowExpiredAt = suspended.offerWindowExpiredAt;
        order.offerSuspendedUntil = suspended.offerSuspendedUntil;
      }
    }

    if (req.userRole === 'provider') {
      const providerLocation =
        resolveRegistrationLocation(req.authUser);
      order.outsideArea = Boolean(
        order.area
        && req.authUser.area
        && order.area !== req.authUser.area,
      );
      order.providerArea = req.authUser.area || '';
      order.providerCity = providerLocation.city;
      order.providerGovernorate = providerLocation.governorate;

      if (!isAssignedProvider) {
        order.phone = order.phone ? order.phone.slice(0, -3) + '***' : '';
      }

      const [offer, rejected] = await Promise.all([
        Offer.findOne({ orderId: order._id, providerId: req.userId })
          .select('price estimatedTime status')
          .lean(),
        RejectedOrder.exists({ orderId: order._id, providerId: req.userId }),
      ]);

      order.myOffer = offer || null;
      order.rejected = Boolean(rejected);
      order.offerCooldownUntil =
        req.authUser.offerCooldownUntil
        && req.authUser.offerCooldownUntil > new Date()
          ? req.authUser.offerCooldownUntil
          : null;
    }

    if (isCustomer) {
      order.rejectedByDriversCount = await RejectedOrder.countDocuments({
        orderId: order._id,
        $or: [
          { reason: 'driver_rejected' },
          { reason: { $exists: false } },
          { reason: null },
        ],
      });
      const rating = await Rating.findOne({
        orderId: order._id,
        customerId: req.userId,
      })
        .select('rating comment createdAt')
        .lean();
      order.myRating = rating || null;

      if (
        ['accepted', 'fulfilling'].includes(order.status)
        && order.providerId
      ) {
        const provider = await User.findById(
          order.providerId,
          'fullName lastLatitude lastLongitude lastLocationUpdate',
        ).lean();
        order.providerName = provider?.fullName || '';
        if (
          provider
          && Number.isFinite(provider.lastLatitude)
          && Number.isFinite(provider.lastLongitude)
        ) {
          order.providerLocation = {
            latitude: provider.lastLatitude,
            longitude: provider.lastLongitude,
            updatedAt: provider.lastLocationUpdate || null,
          };
        } else {
          order.providerLocation = null;
        }
      }
    }

    res.json(order);
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.post('/:id/rating', auth, requireRole('customer'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const rating = Number(req.body?.rating);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        error: 'Rating must be an integer from 1 to 5',
        code: 'INVALID_RATING',
      });
    }

    const comment =
      typeof req.body?.comment === 'string'
        ? req.body.comment.trim().slice(0, 500)
        : '';

    const order = await Order.findOne({
      _id: req.params.id,
      customerId: req.userId,
      status: 'completed',
    }).lean();

    if (!order) {
      return res.status(409).json({
        error: 'Only completed orders can be rated',
        code: 'ORDER_NOT_RATEABLE',
      });
    }

    if (!order.providerId) {
      return res.status(409).json({
        error: 'Order has no assigned provider',
        code: 'ORDER_NOT_RATEABLE',
      });
    }

    let created;
    try {
      created = await Rating.create({
        orderId: order._id,
        customerId: req.userId,
        providerId: order.providerId,
        rating,
        comment,
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({
          error: 'Order has already been rated',
          code: 'RATING_EXISTS',
        });
      }
      throw error;
    }

    const io = req.app.get('io');

    if (io) {
      io.to(`user:${order.providerId}`).emit('rating_received', {
        orderId: order._id,
        rating,
      });
    }

    await createUserNotification({
      io,
      userId: order.providerId,
      orderId: order._id,
      type: 'new_rating',
      title: 'تقييم جديد',
      body: `قيّم الزبون خدمتك بـ ${rating} من 5.`,
      expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).catch(() => {});

    res.status(201).json({
      rating: created.rating,
      comment: created.comment,
      createdAt: created.createdAt,
    });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.put('/:id/fulfilling', auth, requireRole('provider'), async (req, res) => {
  try {
    const order = await lifecycle.transitionOrder({ orderId: req.params.id, providerId: req.userId, from: 'accepted', to: 'fulfilling' });

    const io = req.app.get('io');
    if (io) io.to(`user:${order.customerId}`).emit('order_status_changed', { orderId: order._id, status: 'fulfilling' });

    await createUserNotification({
      io,
      userId: order.customerId,
      orderId: order._id,
      type: 'order_pending',
      title: 'طلبك قيد التنفيذ',
      body: 'بدأ السائق العمل على طلبك.',
      expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).catch(() => {});

    res.json(order);
  } catch (err) {
    if (err instanceof lifecycle.LifecycleConflict) return res.status(409).json(lifecycle.conflictResponse(err));
    if (lifecycle.isTransactionUnavailable(err)) return res.status(503).json({ error: 'Order service is temporarily unavailable' });
    sendInternalServerError(res);
  }
});

router.put('/:id/complete', auth, requireRole('provider'), async (req, res) => {
  try {
    const order = await lifecycle.requestDeliveryConfirmation({ orderId: req.params.id, providerId: req.userId });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${order.customerId}`).emit('delivery_confirmation_requested', {
        orderId: order._id,
      });
    }

    await createUserNotification({
      io,
      userId: order.customerId,
      orderId: order._id,
      type: 'delivery_confirmation',
      title: 'السائق يطلب تأكيد التسليم',
      body: 'يرجى تأكيد استلام الطلب أو عدم الموافقة على التسليم.',
      expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).catch(() => {});

    res.json(order);
  } catch (err) {
    if (err instanceof lifecycle.LifecycleConflict) return res.status(409).json(lifecycle.conflictResponse(err));
    if (lifecycle.isTransactionUnavailable(err)) return res.status(503).json({ error: 'Order service is temporarily unavailable' });
    sendInternalServerError(res);
  }
});

router.put('/:id/confirm-delivery', auth, requireRole('customer'), async (req, res) => {
  try {
    const order = await lifecycle.confirmDelivery({
      orderId: req.params.id,
      customerId: req.userId,
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${order.providerId}`).emit('delivery_confirmation_result', {
        orderId: order._id,
        approved: true,
      });
      io.to(`user:${order.customerId}`).emit('order_status_changed', {
        orderId: order._id,
        status: 'completed',
      });
    }

    await createUserNotification({
      io,
      userId: order.providerId,
      orderId: order._id,
      type: 'delivery_confirmed',
      title: 'تم تأكيد التسليم',
      body: 'أكد الزبون استلام الطلب وتم إكماله بنجاح.',
      expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).catch(() => {});

    res.json(order);
  } catch (err) {
    if (err instanceof lifecycle.LifecycleConflict) return res.status(409).json(lifecycle.conflictResponse(err));
    if (lifecycle.isTransactionUnavailable(err)) return res.status(503).json({ error: 'Order service is temporarily unavailable' });
    sendInternalServerError(res);
  }
});

router.put('/:id/reject-delivery', auth, requireRole('customer'), async (req, res) => {
  try {
    const order = await lifecycle.rejectDelivery({
      orderId: req.params.id,
      customerId: req.userId,
      reason: req.body?.reason,
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${order.providerId}`).emit('delivery_confirmation_result', {
        orderId: order._id,
        approved: false,
        reason: order.deliveryRejectionReason || '',
      });
    }

    await createUserNotification({
      io,
      userId: order.providerId,
      orderId: order._id,
      type: 'delivery_rejected',
      title: 'الزبون لم يوافق على التسليم',
      body: order.deliveryRejectionReason
        ? `سبب الرفض: ${order.deliveryRejectionReason}`
        : 'يرجى التواصل مع الزبون وإعادة تأكيد التسليم.',
      expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).catch(() => {});

    res.json(order);
  } catch (err) {
    if (err instanceof lifecycle.LifecycleConflict) return res.status(409).json(lifecycle.conflictResponse(err));
    if (lifecycle.isTransactionUnavailable(err)) return res.status(503).json({ error: 'Order service is temporarily unavailable' });
    sendInternalServerError(res);
  }
});

module.exports = router;
