const { sendInternalServerError } = require('../security/errorResponse');
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const Order = require('../models/Order');
const Offer = require('../models/Offer');
const RejectedOrder = require('../models/RejectedOrder');
const User = require('../models/User');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const lifecycle = require('../services/orderLifecycle');
const { uploadImagesToCloud } = require('../services/upload');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, path.join(__dirname, '../../uploads')); },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + file.originalname);
  },
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files are allowed'));
  },
});
const uploadMiddleware = upload.array('images', 3);

router.post('/', auth, requireRole('customer'), (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const { type, description, phone, area, location } = req.body;
    if (!type || !description || !phone) return res.status(400).json({ error: 'All fields are required' });

    const user = await User.findById(req.userId);
    if (user.status === 'blocked' || user.deleted) {
      return res.status(403).json({ error: 'تم تجميد حسابك. يرجى التواصل مع الدعم.' });
    }
    const localPaths = req.files ? req.files.map(f => f.path) : [];

    // Registered area is authoritative; GPS-detected area is a fallback only
    const orderArea = user.area || area || '';
    console.log(`[CREATE] data received — area="${orderArea}" (reqBody="${area}" userArea="${user.area}")`);

    // Upload to cloud (ImgBB), fall back to local URLs
    const cloudUrls = await uploadImagesToCloud(localPaths);
    const images = req.files
      ? req.files.map((f, i) => cloudUrls[i] || '/uploads/' + f.filename)
      : [];

    const order = await Order.create({
      customerId: req.userId, type, description, phone, images,
      area: orderArea, location: location || '',
    });
    console.log(`[CREATE] saved order=${order._id} status=${order.status}`);

    // Notify available providers in same area (all active providers if no area specified)
    const providerQuery = {
      role: 'provider',
      status: 'active',
      deleted: { $ne: true },
      $or: [{ blockedUntil: null }, { blockedUntil: { $exists: false } }, { blockedUntil: { $lte: new Date() } }],
    };
    if (orderArea) providerQuery.area = orderArea;
    const providers = await User.find(providerQuery);
    const firstImage = images.length > 0 ? images[0] : '';
    const notifications = providers.map(p => ({
      userId: p._id, orderId: order._id, type: 'new_order',
      title: 'طلب توصيل جديد', body: `طلب ${type} في منطقتك: ${description.substring(0, 80)}`,
      image: firstImage,
    }));
    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    // Emit real-time event to providers in the same area room
    const io = req.app.get('io');
    if (io) {
      const { _id, type, description, phone, images, area: oArea, location: oLocation, status, createdAt } = order.toObject();
      io.to(`area:${orderArea || ''}`).emit('new_order', {
        _id, type, description, phone, images, area: oArea, location: oLocation, status, createdAt,
        phoneMasked: phone.slice(0, -3) + '***',
      });
      // Notify each connected provider to refresh their notification count
      for (const p of providers) {
        const unreadCount = await Notification.countDocuments({ userId: p._id, read: false });
        io.to(`user:${p._id}`).emit('notification_count', { unreadCount });
      }
    }

    // Include image URLs in response
    const result = order.toObject();
    result.images = images;
    res.status(201).json(result);
  } catch (err) {
    console.error('Create order error:', err.message);
    sendInternalServerError(res);
  }
});

router.get('/', auth, requireRole('customer'), async (req, res) => {
  try {
    const orders = await Order.find({ customerId: req.userId, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).lean();
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
      && (!order.area || !req.authUser.area || order.area === req.authUser.area);

    if (!isCustomer && !isAssignedProvider && !isAvailableProvider) {
      return res.status(403).json({ error: 'Order not available' });
    }

    if (req.userRole === 'provider') {
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

    res.json(order);
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.put('/:id/fulfilling', auth, requireRole('provider'), async (req, res) => {
  try {
    const order = await lifecycle.transitionOrder({ orderId: req.params.id, providerId: req.userId, from: 'accepted', to: 'fulfilling' });

    const io = req.app.get('io');
    if (io) io.to(`user:${order.customerId}`).emit('order_status_changed', { orderId: order._id, status: 'fulfilling' });

    res.json(order);
  } catch (err) {
    if (err instanceof lifecycle.LifecycleConflict) return res.status(409).json(lifecycle.conflictResponse(err));
    if (lifecycle.isTransactionUnavailable(err)) return res.status(503).json({ error: 'Order service is temporarily unavailable' });
    sendInternalServerError(res);
  }
});

router.put('/:id/complete', auth, requireRole('provider'), async (req, res) => {
  try {
    const order = await lifecycle.transitionOrder({ orderId: req.params.id, providerId: req.userId, from: 'fulfilling', to: 'completed' });

    const io = req.app.get('io');
    if (io) io.to(`user:${order.customerId}`).emit('order_status_changed', { orderId: order._id, status: 'completed' });

    res.json(order);
  } catch (err) {
    if (err instanceof lifecycle.LifecycleConflict) return res.status(409).json(lifecycle.conflictResponse(err));
    if (lifecycle.isTransactionUnavailable(err)) return res.status(503).json({ error: 'Order service is temporarily unavailable' });
    sendInternalServerError(res);
  }
});

module.exports = router;
