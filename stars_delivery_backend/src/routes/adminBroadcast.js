const { sendInternalServerFailure } = require('../security/errorResponse');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Notification = require('../models/Notification');
const BroadcastMessage = require('../models/BroadcastMessage');

router.post('/:target', async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title || !body) {
      return res.json({ success: false, message: 'الرجاء إدخال عنوان ونص للرسالة' });
    }

    if (
      typeof title !== 'string'
      || typeof body !== 'string'
      || title.trim().length === 0
      || body.trim().length === 0
      || title.trim().length > 150
      || body.trim().length > 2000
    ) {
      return res.status(400).json({
        success: false,
        message: 'عنوان الرسالة أو نصها أطول من الحد المسموح',
      });
    }

    const normalizedTitle = title.trim();
    const normalizedBody = body.trim();

    const role = req.params.target === 'drivers' ? 'provider' : 'customer';
    const label = req.params.target === 'drivers' ? 'سائق' : 'مستخدم';

    const users = await User.find({ role }).lean();

    const archiveEntry = await BroadcastMessage.create({
      target: req.params.target,
      title: normalizedTitle,
      body: normalizedBody,
      recipientCount: users.length,
    });

    const notifications = users.map(u => ({
      userId: u._id,
      type: 'broadcast',
      title: normalizedTitle,
      body: normalizedBody,
      pinned: true,
      expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    // Broadcasts are notification-only: no support-chat message is created and
    // no support-chat reply event is emitted, so users cannot reply to them
    // through the support chat.
    const io = req.app.get('io');
    if (io) {
      for (const u of users) {
        const unreadCount = await Notification.countDocuments({
          userId: u._id,
          read: false,
        });
        io.to(`user:${u._id}`).emit('notification_count', { unreadCount });
        io.to(`user:${u._id}`).emit('broadcast', { title: normalizedTitle, body: normalizedBody });
      }
    }

    res.json({
      success: true,
      message: `تم إرسال الرسالة بنجاح إلى ${users.length} ${label}`,
      title: normalizedTitle,
      count: users.length,
      sentAt: new Date().toLocaleString('ar-EG'),
      archiveId: archiveEntry._id.toString(),
    });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

router.get('/archive/:target', async (req, res) => {
  try {
    const target = req.params.target;
    if (target !== 'drivers' && target !== 'users') {
      return res.status(400).json({ error: 'Invalid broadcast target' });
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const messages = await BroadcastMessage.find({
      target,
      sentAt: { $gte: since },
    })
      .sort({ sentAt: -1 })
      .limit(100)
      .lean();

    res.json(
      messages.map((message) => ({
        _id: message._id.toString(),
        title: message.title,
        body: message.body,
        recipientCount: message.recipientCount || 0,
        sentAt: message.sentAt,
      })),
    );
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

module.exports = router;
