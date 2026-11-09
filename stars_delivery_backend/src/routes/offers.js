const { sendInternalServerError } = require('../security/errorResponse');
const express = require('express');
const Offer = require('../models/Offer');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const lifecycle = require('../services/orderLifecycle');
const {
  resolveRegistrationLocation,
} = require('../services/registrationLocation');

const router = express.Router();

router.post('/', auth, requireRole('provider'), async (req, res) => {
  try {
    const { orderId, price, estimatedTime } = req.body;

    if (!orderId || !price || price <= 0) {
      return res.status(400).json({ error: 'Valid price is required' });
    }

    const result = await lifecycle.submitOffer({ orderId, providerId: req.userId, price, estimatedTime });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${result.customerId}`).emit('new_offer', {
        orderId,
        offerId: result.offer._id,
        price,
        estimatedTime: estimatedTime || 0,
        providerName: result.providerName,
        providerPhone: result.providerPhone,
      });
    }

    res.status(201).json(result.offer);
  } catch (err) {
    if (err instanceof lifecycle.LifecycleConflict) return res.status(409).json(lifecycle.conflictResponse(err));
    if (lifecycle.isTransactionUnavailable(err)) return res.status(503).json({ error: 'Order service is temporarily unavailable' });
    console.error('Create offer error:', err.message);
    sendInternalServerError(res);
  }
});

// Resend rejected order to other providers
router.post('/:orderId/resend', auth, requireRole('customer'), async (req, res) => {
  try {
    await lifecycle.resetOrder({ orderId: req.params.orderId, customerId: req.userId });

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
      .populate('providerId', 'fullName phone area governorate publicId')
      .populate('orderId', 'description area type')
      .sort({ createdAt: -1 })
      .lean();

    const orderArea = (order.area || '').trim();
    res.json(offers.map((offer) => {
      const provider = offer.providerId || {};
      const providerArea = (provider.area || '').trim();
      const providerLocation = resolveRegistrationLocation(provider);

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
      };
    }));
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.post('/:id/accept', auth, requireRole('customer'), async (req, res) => {
  try {
    const result = await lifecycle.acceptOffer({ offerId: req.params.id, customerId: req.userId });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${result.providerId}`).emit('offer_accepted', {
        orderId: result.orderId,
        price: result.price,
      });
    }

    res.json({ message: 'Offer accepted' });
  } catch (err) {
    if (err instanceof lifecycle.LifecycleConflict) return res.status(409).json(lifecycle.conflictResponse(err));
    if (lifecycle.isTransactionUnavailable(err)) return res.status(503).json({ error: 'Order service is temporarily unavailable' });
    console.error('Accept offer error:', err.message);
    sendInternalServerError(res);
  }
});

module.exports = router;