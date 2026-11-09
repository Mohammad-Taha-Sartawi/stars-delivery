const { sendInternalServerFailure } = require('../security/errorResponse');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Notification = require('../models/Notification');

router.post('/:target', async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title || !body) {
      return res.json({ success: false, message: 'الرجاء إدخال عنوان ونص للرسالة' });
    }

    const role = req.params.target === 'drivers' ? 'provider' : 'customer';
    const label = req.params.target === 'drivers' ? 'سائق' : 'مستخدم';

    const users = await User.find({ role }).lean();

    const notifications = users.map(u => ({
      userId: u._id,
      type: 'broadcast',
      title,
      body,
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
        io.to(`user:${u._id}`).emit('broadcast', { title, body });
      }
    }

    res.json({
      success: true,
      message: `تم إرسال الرسالة بنجاح إلى ${users.length} ${label}`,
      title,
      count: users.length,
      sentAt: new Date().toLocaleString('ar-EG'),
    });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

module.exports = router;
