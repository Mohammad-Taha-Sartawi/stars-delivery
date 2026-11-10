const { sendInternalServerError } = require('../security/errorResponse');
const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Offer = require('../models/Offer');
const RejectedOrder = require('../models/RejectedOrder');
const User = require('../models/User');
const Rating = require('../models/Rating');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const lifecycle = require('../services/orderLifecycle');
const { normalizeServiceTypes } = require('../services/providerServiceTypes');
const { splitCommission } = require('../services/commissionLedger');
const {
  providerVisibilityFilter,
  canProviderSeeOrder,
} = require('../services/orderVisibility');

const router = express.Router();
router.use(auth, requireRole('provider'));

router.put('/availability', async (req, res) => {
  try {
    const available = req.body?.available;

    if (typeof available !== 'boolean') {
      return res.status(400).json({
        error: 'available must be a boolean',
      });
    }

    const provider = await User.findOneAndUpdate(
      {
        _id: req.userId,
        role: 'provider',
        deleted: { $ne: true },
      },
      { $set: { isAvailable: available } },
      { new: true },
    ).select('isAvailable').lean();

    if (!provider) {
      return res.status(404).json({
        error: 'Provider not found',
      });
    }

    return res.json({
      success: true,
      isAvailable: provider.isAvailable !== false,
    });
  } catch (err) {
    sendInternalServerError(res);
  }
});

async function excludedOrderIds(providerId) {
  const now = new Date();
  const [offeredIds, rejectedIds] = await Promise.all([
    Offer.find({
      providerId,
      $or: [
        { status: { $ne: 'pending' } },
        { status: 'pending', expiresAt: { $gt: now } },
      ],
    }).distinct('orderId'),
    RejectedOrder.find({ providerId }).distinct('orderId'),
  ]);

  return [...offeredIds, ...rejectedIds];
}

function maskedOrder(order) {
  return {
    ...order,
    phone: order.phone ? order.phone.slice(0, -3) + '***' : '',
  };
}

router.get('/stats', async (req, res) => {
  const t0 = Date.now();
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const match = { providerId: req.userId, status: { $in: ['accepted', 'fulfilling', 'completed'] } };

    const t1 = Date.now();
    const [dailyOrders, monthlyOrders, allCommissionOrders, user, ratingSummary] = await Promise.all([
      Order.find({ ...match, createdAt: { $gte: startOfDay } }).lean(),
      Order.find({ ...match, createdAt: { $gte: startOfMonth } }).lean(),
      Order.find(match)
        .select('platformCommission acceptedAt completedAt createdAt')
        .lean(),
      User.findById(req.userId),
      Rating.aggregate([
        { $match: { providerId: new mongoose.Types.ObjectId(req.userId) } },
        {
          $group: {
            _id: null,
            average: { $avg: '$rating' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);
    const t2 = Date.now();

    // Registered area is authoritative; GPS-detected area is a fallback only
    const qArea = user.area || req.query.area || '';
    const blocked = Boolean(user.blockedUntil && user.blockedUntil > now);
    const serviceTypes = normalizeServiceTypes(user.serviceTypes);
    const areaFilter = {
      status: { $in: ['pending', 'offered'] },
      offerSuspendedUntil: null,
    };
    const visibility = providerVisibilityFilter({
      area: qArea,
      governorate: user.governorate,
      governorateLevel: user.governorateLevel === true,
    });
    if (visibility) {
      areaFilter.$or = visibility.$or;
    }
    if (serviceTypes.length > 0) {
      areaFilter.type = { $in: serviceTypes };
    }
    // Exclude orders this provider already offered on or rejected
    const [offeredIds, rejectedIds, rejectedReportCount, lostOfferOrderIds] = await Promise.all([
      Offer.find({
        providerId: req.userId,
        $or: [
          { status: { $ne: 'pending' } },
          { status: 'pending', expiresAt: { $gt: now } },
        ],
      }).distinct('orderId'),
      RejectedOrder.find({ providerId: req.userId }).distinct('orderId'),
      // Count only rejections whose order still exists, so deleting orders
      // removes them from the provider's report counter too.
      RejectedOrder.aggregate([
        {
          $match: {
            providerId: new mongoose.Types.ObjectId(req.userId),
            createdAt: { $lte: now },
          },
        },
        {
          $lookup: {
            from: 'orders',
            localField: 'orderId',
            foreignField: '_id',
            as: 'order',
          },
        },
        { $match: { 'order.0': { $exists: true } } },
        { $count: 'count' },
      ]).then((rows) => rows[0]?.count || 0),
      Offer.find({
        providerId: req.userId,
        status: 'rejected',
        rejectionReason: 'another_driver_selected',
      }).distinct('orderId'),
    ]);
    const excludedIds = [...offeredIds, ...rejectedIds];
    if (excludedIds.length > 0) areaFilter._id = { $nin: excludedIds };
    const pendingOrdersCount =
      blocked
        ? 0
        : await Order.countDocuments(areaFilter);
    const t3 = Date.now();

    const totalSuccessful = monthlyOrders.filter(o => o.status === 'completed').length;
    const dailyOrderCount = dailyOrders.length;
    const activeOrdersCount = await Order.countDocuments({ providerId: req.userId, status: { $in: ['accepted', 'fulfilling'] } });
    const deliveredOrdersCount = await Order.countDocuments({ providerId: req.userId, status: 'completed' });
    const notSelectedReportCount = lostOfferOrderIds.length > 0
      ? await Order.countDocuments({ _id: { $in: lostOfferOrderIds } })
      : 0;
    const ordersReportCount =
      rejectedReportCount + deliveredOrdersCount + notSelectedReportCount;
    const offerCooldownUntil =
      user.offerCooldownUntil && user.offerCooldownUntil > now
        ? user.offerCooldownUntil
        : null;
    const offeredOrdersCount = offeredIds.length > 0
      ? await Order.countDocuments({ _id: { $in: offeredIds }, status: { $in: ['pending', 'offered'] } })
      : 0;

    const dbTime = t2 - t1;
    const countTime = t3 - t2;
    const totalTime = Date.now() - t0;
    console.log(`[STATS] userId=${req.userId} area="${qArea}" pending=${pendingOrdersCount} total=${totalTime}ms`);
    if (totalTime > 1000) {
      console.warn(`[SLOW] /stats took ${totalTime}ms (queries: ${dbTime}ms, count: ${countTime}ms)`);
    }

    const { unpaid: dailyCommissionDue } = splitCommission(dailyOrders, user);
    const { unpaid: monthlyCommissionDue } = splitCommission(
      monthlyOrders,
      user,
    );
    const { unpaid: totalCommissionDue } = splitCommission(
      allCommissionOrders,
      user,
    );

    res.json({
      dailyEarnings: dailyOrders.reduce((s, o) => s + (o.providerEarning || 0), 0),
      monthlyEarnings: monthlyOrders.reduce((s, o) => s + (o.providerEarning || 0), 0),
      totalSuccessful,
      dailyOrderCount,
      dailyCommission: dailyCommissionDue,
      monthlyCommission: monthlyCommissionDue,
      totalCommissionDue,
      pendingOrdersCount,
      offeredOrdersCount,
      ordersReportCount,
      activeOrdersCount,
      averageRating: Math.round((ratingSummary[0]?.average || 0) * 10) / 10,
      ratingCount: ratingSummary[0]?.count || 0,
      blockedUntil: blocked ? user.blockedUntil : null,
      offerCooldownUntil,
      isAvailable: user.isAvailable !== false,
    });
  } catch (err) {
    console.error('Stats error:', err.message);
    sendInternalServerError(res);
  }
});

router.get('/pending-orders', async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (user.blockedUntil && user.blockedUntil > new Date()) {
      return res.json([]);
    }

    if (user.isAvailable === false) {
      return res.json([]);
    }

    // Registered area is authoritative; GPS-detected area is a fallback only
    const qArea = user.area || req.query.area || '';
    const serviceTypes = normalizeServiceTypes(user.serviceTypes);
    const areaFilter = {
      status: { $in: ['pending', 'offered'] },
      offerSuspendedUntil: null,
    };
    const visibility = providerVisibilityFilter({
      area: qArea,
      governorate: user.governorate,
      governorateLevel: user.governorateLevel === true,
    });
    if (visibility) {
      areaFilter.$or = visibility.$or;
    }
    if (serviceTypes.length > 0) {
      areaFilter.type = { $in: serviceTypes };
    }
    // Exclude orders where this provider already submitted an offer or rejected
    const excludedIds = await excludedOrderIds(req.userId);
    if (excludedIds.length > 0) areaFilter._id = { $nin: excludedIds };
    const orders = await Order.find(areaFilter).sort({ createdAt: -1 })
      .populate('customerId', 'fullName publicId')
      .lean();

    console.log(`[PENDING] userId=${req.userId} area="${qArea}" count=${orders.length}`);

    res.json(orders.map(maskedOrder));
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.get('/offered-orders', async (req, res) => {
  try {
    // Find orders where this provider has submitted an offer but order is not yet accepted
    const offers = await Offer.find({
      providerId: req.userId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    }).lean();
    const offeredIds = offers.map(o => o.orderId);
    const orders = await Order.find({
      _id: { $in: offeredIds },
      status: { $in: ['pending', 'offered'] },
    }).populate('customerId', 'fullName publicId').sort({ createdAt: -1 }).lean();

    const offerMap = {};
    offers.forEach(o => { offerMap[o.orderId.toString()] = { price: o.price, estimatedTime: o.estimatedTime || 0 }; });

    const masked = orders.map(o => ({
      ...o,
      phone: o.phone ? o.phone.slice(0, -3) + '***' : '',
      offeredPrice: offerMap[o._id.toString()]?.price || 0,
      offeredTime: offerMap[o._id.toString()]?.estimatedTime || 0,
    }));
    res.json(masked);
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.post('/orders/:orderId/reject', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.orderId)) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = await Order.findOne({
      _id: req.params.orderId,
      status: { $in: ['pending', 'offered'] },
    }).select('_id area governorate governorateLevel').lean();

    if (!order) {
      return res.status(409).json({ error: 'Order is no longer available' });
    }

    const provider = await User.findById(
      req.userId,
      'area governorate governorateLevel',
    ).lean();
    if (!provider || !canProviderSeeOrder(provider, order)) {
      return res.status(403).json({ error: 'Order is outside your area' });
    }

    const hasOffer = await Offer.exists({
      orderId: order._id,
      providerId: req.userId,
    });

    if (hasOffer) {
      return res.status(409).json({ error: 'You have already submitted an offer for this order' });
    }

    try {
      await RejectedOrder.updateOne(
        { providerId: req.userId, orderId: order._id },
        {
          $set: { reason: 'driver_rejected' },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }

    await lifecycle.suspendIfUnanswered(order);

    return res.json({ success: true, message: 'تم رفض الطلب' });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.get('/rejected-orders', async (req, res) => {
  try {
    const [rejections, deliveredOrders, notSelectedOffers] = await Promise.all([
      RejectedOrder.find({
        providerId: req.userId,
        createdAt: { $lte: new Date() },
      })
        .sort({ createdAt: -1 })
        .lean(),
      Order.find({ providerId: req.userId, status: 'completed' })
        .populate('customerId', 'fullName publicId')
        .lean(),
      Offer.find({
        providerId: req.userId,
        status: 'rejected',
        rejectionReason: 'another_driver_selected',
      })
        .sort({ rejectedAt: -1, createdAt: -1 })
        .lean(),
    ]);

    const notSelectedOrderIds = notSelectedOffers.map(o => o.orderId.toString());
    const orderIds = [
      ...new Set([
        ...rejections.map(r => r.orderId.toString()),
        ...notSelectedOrderIds,
      ]),
    ];
    const orders = await Order.find({ _id: { $in: orderIds } })
      .populate('customerId', 'fullName publicId')
      .lean();

    const orderMap = new Map(orders.map(o => [o._id.toString(), o]));

    const rejected = rejections
      .map(r => {
        const order = orderMap.get(r.orderId.toString());
        if (!order) return null;
        return maskedOrder({
          ...order,
          recordType: 'rejected',
          reason: r.reason || 'driver_rejected',
          reportAt: r.createdAt,
        });
      })
      .filter(Boolean);

    const delivered = deliveredOrders.map(o => ({
      ...o,
      recordType: 'delivered',
      reportAt: o.completedAt || o.createdAt,
    }));

    const notSelectedByOrder = new Map();
    for (const offer of notSelectedOffers) {
      const orderId = offer.orderId.toString();
      if (notSelectedByOrder.has(orderId)) continue;

      const order = orderMap.get(orderId);
      if (!order) continue;

      notSelectedByOrder.set(orderId, maskedOrder({
        ...order,
        recordType: 'offer_not_selected',
        offeredPrice: offer.price,
        acceptedPrice: offer.competingPrice || 0,
        reason: 'another_driver_selected',
        reportAt: offer.rejectedAt || offer.createdAt,
      }));
    }

    const report = [...rejected, ...delivered, ...notSelectedByOrder.values()]
      .sort((a, b) => new Date(b.reportAt) - new Date(a.reportAt));

    res.json(report);
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.get('/orders', async (req, res) => {
  try {
    const orders = await Order.find({ providerId: req.userId }).sort({ createdAt: -1 })
      .populate('customerId', 'fullName publicId')
      .lean();
    res.json(orders);
  } catch (err) {
    sendInternalServerError(res);
  }
});

module.exports = router;