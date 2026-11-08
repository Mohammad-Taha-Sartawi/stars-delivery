const { sendInternalServerError } = require('../security/errorResponse');
const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const ChatMessage = require('../models/ChatMessage');
const ContactRequest = require('../models/ContactRequest');
const User = require('../models/User');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const requireAdminSession = require('../middleware/requireAdminSession');
const { adminCsrfProtection } = require('../security/adminCsrf');
const {
  ContactValidationError,
  normalizeContactPayload,
  contactConversationId,
  parseContactConversationId,
  formatContactMessage,
} = require('../services/contactRequest');

const router = express.Router();

const publicContactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many contact requests. Please try again later.',
    code: 'CONTACT_RATE_LIMITED',
  },
});

router.get('/history', auth, requireRole('customer', 'provider'), async (req, res) => {
  try {
    const messages = await ChatMessage.find({ userId: req.userId })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    res.json(messages);
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.post('/send', auth, requireRole('customer', 'provider'), async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const msg = await ChatMessage.create({
      userId: req.userId,
      sender: 'user',
      text: text.trim(),
    });

    await ChatMessage.updateMany(
      {
        userId: req.userId,
        sender: 'admin',
        read: false,
      },
      { read: true },
    );

    const io = req.app.get('io');

    if (io) {
      const user = await User.findById(
        req.userId,
        'fullName publicId role',
      );

      io.to('support').emit('support_message', {
        _id: msg._id,
        userId: req.userId,
        userName: user?.fullName || '',
        userPublicId: user?.publicId || '',
        userRole: user?.role || '',
        text: msg.text,
        createdAt: msg.createdAt,
      });
    }

    res.status(201).json(msg.toObject());
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.get('/unread-count', auth, requireRole('customer', 'provider'), async (req, res) => {
  try {
    const count = await ChatMessage.countDocuments({
      userId: req.userId,
      sender: 'admin',
      read: false,
    });

    res.json({ count });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.put('/read', auth, requireRole('customer', 'provider'), async (req, res) => {
  try {
    await ChatMessage.updateMany(
      {
        userId: req.userId,
        sender: 'admin',
        read: false,
      },
      { read: true },
    );

    res.json({ success: true });
  } catch (err) {
    sendInternalServerError(res);
  }
});

// All /admin routes below require the hardened administrator session.
router.use(
  '/admin',
  requireAdminSession,
  adminCsrfProtection,
);

router.get('/admin/conversations', async (req, res) => {
  try {
    const conversations = await ChatMessage.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$userId',
          lastMessage: { $first: '$text' },
          lastTime: { $first: '$createdAt' },
          unread: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$sender', 'user'] },
                    { $eq: ['$read', false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const userIds = conversations.map((conversation) => conversation._id);

    const users = await User.find(
      { _id: { $in: userIds } },
      'fullName publicId role',
    ).lean();

    const userMap = new Map(
      users.map((user) => [user._id.toString(), user]),
    );

    const registeredConversations = conversations.map((conversation) => {
      const user = userMap.get(conversation._id.toString());

      return {
        userId: conversation._id.toString(),
        userName: user?.fullName || 'Unknown',
        userPublicId: user?.publicId || '',
        userRole: user?.role || '',
        lastMessage: conversation.lastMessage,
        lastTime: conversation.lastTime,
        unread: conversation.unread || 0,
      };
    });

    const contacts = await ContactRequest.find({ resolved: false })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const publicContacts = contacts.map((contact) => ({
      userId: contactConversationId(contact._id),
      userName: contact.name || 'Guest',
      userPublicId: '',
      userRole: 'guest',
      lastMessage: formatContactMessage(contact),
      lastTime: contact.createdAt,
      unread: contact.read ? 0 : 1,
    }));

    const result = [
      ...registeredConversations,
      ...publicContacts,
    ].sort(
      (a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime(),
    );

    res.json(result);
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.get('/admin/messages/:userId', async (req, res) => {
  try {
    const rawConversationId = req.params.userId;
    const contactId = parseContactConversationId(rawConversationId);

    if (contactId) {
      const contact = await ContactRequest.findOne({
        _id: contactId,
        resolved: false,
      }).lean();

      if (!contact) {
        return res.status(404).json({ error: 'Contact request not found' });
      }

      return res.json([{
        _id: contact._id,
        sender: 'user',
        text: formatContactMessage(contact),
        read: true,
        createdAt: contact.createdAt,
      }]);
    }

    if (
      rawConversationId.startsWith('contact:')
      || !mongoose.isValidObjectId(rawConversationId)
    ) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }

    const messages = await ChatMessage.find({
      userId: rawConversationId,
    })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    res.json(messages);
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.post('/admin/messages/:userId/read', async (req, res) => {
  try {
    const rawConversationId = req.params.userId;
    const contactId =
      parseContactConversationId(
        rawConversationId,
      );

    if (contactId) {
      const result =
        await ContactRequest.updateOne(
          {
            _id: contactId,
            resolved: false,
          },
          {
            $set: {
              read: true,
            },
          },
        );

      if (result.matchedCount !== 1) {
        return res
          .status(404)
          .json({
            error:
              'Contact request not found',
          });
      }

      return res.json({
        success: true,
      });
    }

    if (
      rawConversationId.startsWith(
        'contact:',
      )
      || !mongoose.isValidObjectId(
        rawConversationId,
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'Invalid conversation id',
        });
    }

    await ChatMessage.updateMany(
      {
        userId: rawConversationId,
        sender: 'user',
        read: false,
      },
      {
        read: true,
      },
    );

    return res.json({
      success: true,
    });
  } catch (err) {
    return sendInternalServerError(res);
  }
});

router.post('/admin/reply/:userId', async (req, res) => {
  try {
    const rawConversationId = req.params.userId;

    if (parseContactConversationId(rawConversationId)) {
      return res.status(409).json({
        error: 'Public contact requests cannot receive in-app replies. Use the supplied email or phone number.',
        code: 'CONTACT_REPLY_EXTERNAL_ONLY',
      });
    }

    if (
      rawConversationId.startsWith('contact:')
      || !mongoose.isValidObjectId(rawConversationId)
    ) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }

    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const msg = await ChatMessage.create({
      userId: rawConversationId,
      sender: 'admin',
      text: text.trim(),
      read: false,
    });

    const io = req.app.get('io');

    if (io) {
      io.to(`user:${rawConversationId}`).emit('support_reply', {
        _id: msg._id,
        userId: rawConversationId,
        sender: 'admin',
        text: msg.text,
        createdAt: msg.createdAt,
      });
    }

    res.status(201).json(msg.toObject());
  } catch (err) {
    sendInternalServerError(res);
  }
});

// Public contact endpoint. A contact request is not an application User.
router.post('/contact', publicContactLimiter, async (req, res) => {
  try {
    const contactData = normalizeContactPayload(req.body);

    const contact = await ContactRequest.create(contactData);
    const conversationId = contactConversationId(contact._id);
    const formattedText = formatContactMessage(contact);

    const io = req.app.get('io');

    if (io) {
      io.to('support').emit('support_message', {
        _id: contact._id,
        userId: conversationId,
        userName: contact.name,
        userPublicId: '',
        userRole: 'guest',
        text: formattedText,
        createdAt: contact.createdAt,
      });
    }

    res.status(201).json({
      success: true,
      message: 'تم إرسال رسالتك. سنتواصل معك قريباً.',
    });
  } catch (err) {
    if (err instanceof ContactValidationError) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
      });
    }

    sendInternalServerError(res);
  }
});

router.delete('/admin/resolve/:userId', async (req, res) => {
  try {
    const rawConversationId = req.params.userId;
    const contactId = parseContactConversationId(rawConversationId);

    if (contactId) {
      const result = await ContactRequest.updateOne(
        {
          _id: contactId,
          resolved: false,
        },
        {
          $set: {
            resolved: true,
            resolvedAt: new Date(),
            read: true,
          },
        },
      );

      if (result.matchedCount !== 1) {
        return res.status(404).json({ error: 'Contact request not found' });
      }

      return res.json({
        success: true,
        message: 'تم حل طلب التواصل بنجاح',
      });
    }

    if (
      rawConversationId.startsWith('contact:')
      || !mongoose.isValidObjectId(rawConversationId)
    ) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }

    await ChatMessage.deleteMany({ userId: rawConversationId });

    res.json({
      success: true,
      message: 'تم حذف المحادثة بنجاح',
    });
  } catch (err) {
    sendInternalServerError(res);
  }
});

module.exports = router;
