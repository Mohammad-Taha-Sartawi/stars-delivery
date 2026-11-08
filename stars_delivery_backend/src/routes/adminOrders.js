const {
  sendInternalServerError,
  sendInternalServerFailure,
} = require('../security/errorResponse');
const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Offer = require('../models/Offer');
const RejectedOrder = require('../models/RejectedOrder');
const User = require('../models/User');
const lifecycle = require('../services/orderLifecycle');

const router = express.Router();

function activeOfferFilter(orderId, now = new Date()) {
  return {
    orderId,
    status: 'pending',
    $or: [
      { expiresAt: { $gt: now } },
      { expiresAt: null },
      { expiresAt: { $exists: false } },
    ],
  };
}

router.get('/', async (req, res) => {
  try {
    const { status, type, area, q } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (type && type !== 'all') {
      filter.type = type;
    }

    if (area) {
      filter.area = String(area).trim();
    }

    if (q && String(q).trim()) {
      const text = String(q).trim();

      if (mongoose.isValidObjectId(text)) {
        filter._id = text;
      } else {
        filter.description = { $regex: text, $options: 'i' };
      }
    }

    const orders = await Order.find(filter)
      .populate('customerId', 'fullName publicId')
      .populate('providerId', 'fullName publicId')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json(orders);
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    const order = await Order.findById(req.params.id)
      .populate('customerId', 'fullName publicId phoneNumbers area')
      .populate('providerId', 'fullName publicId phoneNumbers area')
      .lean();

    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    const [offers, rejections] = await Promise.all([
      Offer.find({ orderId: order._id })
        .populate('providerId', 'fullName publicId phoneNumbers')
        .sort({ createdAt: -1 })
        .lean(),
      RejectedOrder.find({ orderId: order._id })
        .populate('providerId', 'fullName publicId')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    res.json({ order, offers, rejections });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }

    const order = await Order.findById(req.params.id)
      .select('status providerId')
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }

    if (['completed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'لا يمكن إلغاء هذا الطلب في حالته الحالية',
      });
    }

    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          status: 'cancelled',
          offerSuspendedUntil: null,
          offerWindowExpiredAt: null,
        },
      },
    );

    await Offer.updateMany(
      { orderId: order._id, status: 'pending' },
      { $set: { status: 'rejected' } },
    );

    if (order.providerId) {
      await User.updateOne(
        { _id: order.providerId },
        { $set: { blockedUntil: null } },
      );
    }

    res.json({ success: true, message: 'تم إلغاء الطلب' });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

router.post('/:id/resend', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }

    const order = await Order.findById(req.params.id)
      .select('customerId')
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }

    await lifecycle.resetOrder({
      orderId: order._id,
      customerId: order.customerId,
    });

    res.json({ success: true, message: 'تم إعادة إرسال الطلب للسائقين' });
  } catch (err) {
    if (err instanceof lifecycle.LifecycleConflict) {
      return res.status(409).json({
        success: false,
        message: err.message,
      });
    }

    sendInternalServerFailure(res);
  }
});

router.post('/:id/end-suspension', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }

    const update = await Order.updateOne(
      {
        _id: req.params.id,
        status: 'pending',
        offerSuspendedUntil: { $ne: null },
      },
      { $set: { status: 'expired' } },
    );

    if (update.modifiedCount !== 1) {
      return res.status(400).json({
        success: false,
        message: 'لا يوجد تعليق نشط لهذا الطلب',
      });
    }

    res.json({
      success: true,
      message: 'تم إنهاء التعليق ونقل الطلب إلى التقارير',
    });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

router.post('/:id/offers/:offerId/reject', async (req, res) => {
  try {
    if (
      !mongoose.isValidObjectId(req.params.id)
      || !mongoose.isValidObjectId(req.params.offerId)
    ) {
      return res.status(404).json({ success: false, message: 'العرض غير موجود' });
    }

    const offer = await Offer.findOneAndUpdate(
      {
        _id: req.params.offerId,
        orderId: req.params.id,
        status: 'pending',
      },
      { $set: { status: 'rejected' } },
      { new: true },
    );

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'العرض غير موجود أو لم يعد قابلاً للرفض',
      });
    }

    const remainingOffer = await Offer.exists(
      activeOfferFilter(offer.orderId),
    );

    if (!remainingOffer) {
      await Order.updateOne(
        { _id: offer.orderId, status: 'offered' },
        { $set: { status: 'pending' } },
      );
    }

    res.json({ success: true, message: 'تم رفض عرض السعر' });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

module.exports = router;
