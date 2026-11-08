const { sendInternalServerFailure } = require('../security/errorResponse');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Notification = require('../models/Notification');
const ChatMessage = require('../models/ChatMessage');

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

    const chatText = `${title}\n${body}`;
    const chatMessages = users.length > 0
      ? await ChatMessage.insertMany(
          users.map((u) => ({
            userId: u._id,
            sender: 'admin',
            text: chatText,
            read: false,
          })),
        )
      : [];

    // Emit real-time notification and support message to all target users
    const io = req.app.get('io');
    if (io) {
      for (let index = 0; index < users.length; index += 1) {
        const u = users[index];
        const unreadCount = await Notification.countDocuments({ userId: u._id, read: false });
        io.to(`user:${u._id}`).emit('notification_count', { unreadCount });
        io.to(`user:${u._id}`).emit('broadcast', { title, body });
        const chatMessage = chatMessages[index];
        if (chatMessage) {
          io.to(`user:${u._id}`).emit('support_reply', {
            _id: chatMessage._id,
            userId: u._id,
            sender: 'admin',
            text: chatText,
            createdAt: chatMessage.createdAt,
          });
        }
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
