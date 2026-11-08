const { sendInternalServerError } = require('../security/errorResponse');
const express = require('express');
const mongoose = require('mongoose');
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');

const router = express.Router();

function targetRole(type) {
  return type === 'driver' ? 'provider' : 'customer';
}

function formatMessage(message) {
  return {
    sender: message.sender === 'admin' ? 'admin' : 'other',
    text: message.text,
    time: new Date(message.createdAt).toLocaleTimeString(
      'ar-EG',
      {
        hour: '2-digit',
        minute: '2-digit',
      },
    ),
  };
}

async function findTarget(type, id) {
  if (!mongoose.isValidObjectId(id)) {
    return null;
  }

  return User.findOne(
    {
      _id: id,
      role: targetRole(type),
      deleted: { $ne: true },
    },
    'fullName name role',
  ).lean();
}

async function loadMessages(userId) {
  return ChatMessage.find({ userId })
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();
}

router.get('/messages/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;

    if (type !== 'driver' && type !== 'user') {
      return res.status(400).json({ error: 'نوع المحادثة غير صالح' });
    }

    const target = await findTarget(type, id);

    if (!target) {
      return res.status(404).json({ error: 'الطرف غير موجود' });
    }

    const messages = await loadMessages(target._id);

    return res.json({
      messages: messages.map(formatMessage),
      name: target.fullName || target.name || '',
      type,
    });
  } catch (err) {
    return sendInternalServerError(res);
  }
});

router.post('/send/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;

    if (type !== 'driver' && type !== 'user') {
      return res.status(400).json({ success: false, message: 'نوع المحادثة غير صالح' });
    }

    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

    if (!text) {
      return res.status(400).json({ success: false, message: 'الرجاء كتابة رسالة' });
    }

    const target = await findTarget(type, id);

    if (!target) {
      return res.status(404).json({ success: false, message: 'الطرف غير موجود' });
    }

    const message = await ChatMessage.create({
      userId: target._id,
      sender: 'admin',
      text,
      read: false,
    });

    const io = req.app.get('io');

    if (io) {
      io.to(`user:${target._id}`).emit('support_reply', {
        _id: message._id,
        userId: target._id,
        sender: 'admin',
        text: message.text,
        createdAt: message.createdAt,
      });
    }

    const messages = await loadMessages(target._id);

    return res.json({
      success: true,
      name: target.fullName || target.name || '',
      messages: messages.map(formatMessage),
    });
  } catch (err) {
    return sendInternalServerError(res);
  }
});

module.exports = router;
