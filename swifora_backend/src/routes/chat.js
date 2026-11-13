const { sendInternalServerError } = require('../security/errorResponse');
const crypto = require('crypto');
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
  chatSendLimiter,
  chatSendIpLimiter,
} = require('../security/actionRateLimit');
const {
  ContactValidationError,
  normalizeContactPayload,
  contactConversationId,
  parseContactConversationId,
  formatContactMessage,
} = require('../services/contactRequest');
const {
  getPasswordRecoveryMailer,
} = require('../services/passwordRecoveryMailer');

const router = express.Router();

function hashContactToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function contactTokenMatches(contact, supplied) {
  if (!contact?.accessTokenHash || typeof supplied !== 'string' || supplied.length < 32) {
    return false;
  }
  const expected = Buffer.from(contact.accessTokenHash, 'hex');
  const actual = Buffer.from(hashContactToken(supplied), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** The whole guest conversation, oldest first, as {sender, text, createdAt}. */
function contactThread(contact) {
  return [
    { _id: contact._id, sender: 'guest', text: contact.text, createdAt: contact.createdAt },
    ...(contact.messages || []).map((message) => ({
      _id: message._id,
      sender: message.sender,
      text: message.text,
      emailed: message.emailed === true,
      createdAt: message.createdAt,
    })),
  ];
}

function boundedMessageText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return { error: 'Message is required', code: 'CONTACT_MESSAGE_REQUIRED' };
  if (text.length > 2000) return { error: 'Message is too long', code: 'MESSAGE_TOO_LONG' };
  return { text };
}

// Follow-up messages from a guest; a little more generous than new requests.
const guestFollowUpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many messages. Please try again later.',
    code: 'CONTACT_RATE_LIMITED',
  },
});

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

router.post('/send', auth, requireRole('customer', 'provider'), chatSendLimiter, chatSendIpLimiter, async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string'
      ? req.body.text.trim()
      : '';

    if (!text) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (text.length > 2000) {
      return res.status(400).json({
        error: 'Message is too long',
        code: 'MESSAGE_TOO_LONG',
      });
    }

    const msg = await ChatMessage.create({
      userId: req.userId,
      sender: 'user',
      text,
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

    const publicContacts = contacts.map((contact) => {
      const last = (contact.messages || [])[contact.messages?.length - 1];
      return {
        userId: contactConversationId(contact._id),
        userName: contact.name || 'Guest',
        userPublicId: '',
        userRole: 'guest',
        lastMessage: last ? last.text : formatContactMessage(contact),
        lastTime: last ? last.createdAt : contact.createdAt,
        unread: contact.read ? 0 : 1,
      };
    });

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

      // The first message shows the contact details the guest left.
      return res.json(contactThread(contact).map((message, index) => ({
        _id: message._id,
        sender: message.sender === 'admin' ? 'admin' : 'user',
        text: index === 0 ? formatContactMessage(contact) : message.text,
        read: true,
        createdAt: message.createdAt,
      })));
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

    const contactId = parseContactConversationId(rawConversationId);
    if (contactId) {
      const checked = boundedMessageText(req.body?.text);
      if (checked.error) return res.status(400).json(checked);

      const contact = await ContactRequest.findById(contactId);
      if (!contact) {
        return res.status(404).json({ error: 'Contact request not found' });
      }

      // Guests who left an email also get the reply there.
      let emailed = false;
      if (contact.email) {
        try {
          await getPasswordRecoveryMailer().sendSupportReply({
            to: contact.email,
            name: contact.name,
            text: checked.text,
          });
          emailed = true;
        } catch (_) {
          // The reply is still available in the guest's app.
        }
      }

      contact.messages.push({ sender: 'admin', text: checked.text, emailed });
      contact.lastMessageAt = new Date();
      contact.read = true;
      await contact.save();
      const saved = contact.messages[contact.messages.length - 1];

      return res.status(201).json({
        _id: saved._id,
        userId: rawConversationId,
        sender: 'admin',
        text: saved.text,
        emailed,
        createdAt: saved.createdAt,
      });
    }

    if (
      rawConversationId.startsWith('contact:')
      || !mongoose.isValidObjectId(rawConversationId)
    ) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }

    const text = typeof req.body?.text === 'string'
      ? req.body.text.trim()
      : '';

    if (!text) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (text.length > 2000) {
      return res.status(400).json({
        error: 'Message is too long',
        code: 'MESSAGE_TOO_LONG',
      });
    }

    const msg = await ChatMessage.create({
      userId: rawConversationId,
      sender: 'admin',
      text,
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
    const accessToken = crypto.randomBytes(32).toString('base64url');

    const contact = await ContactRequest.create({
      ...contactData,
      accessTokenHash: hashContactToken(accessToken),
    });
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
      // Kept only on the guest's device; it opens this conversation.
      contactId: contact._id,
      accessToken,
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

async function findGuestContact(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: 'Conversation not found', code: 'CONTACT_NOT_FOUND' });
    return null;
  }
  const contact = await ContactRequest.findById(req.params.id).select('+accessTokenHash');
  if (!contact || !contactTokenMatches(contact, req.get('x-contact-token'))) {
    res.status(404).json({ error: 'Conversation not found', code: 'CONTACT_NOT_FOUND' });
    return null;
  }
  return contact;
}

// A guest reads their support conversation (our replies included).
router.get('/contact/:id/messages', async (req, res) => {
  try {
    const contact = await findGuestContact(req, res);
    if (!contact) return;
    res.json({ resolved: contact.resolved === true, messages: contactThread(contact) });
  } catch (err) {
    sendInternalServerError(res);
  }
});

// A guest answers back in the same conversation; it reopens if resolved.
router.post('/contact/:id/messages', guestFollowUpLimiter, async (req, res) => {
  try {
    const checked = boundedMessageText(req.body?.text);
    if (checked.error) return res.status(400).json(checked);
    const contact = await findGuestContact(req, res);
    if (!contact) return;

    contact.messages.push({ sender: 'guest', text: checked.text });
    contact.lastMessageAt = new Date();
    contact.read = false;
    contact.resolved = false;
    contact.resolvedAt = null;
    await contact.save();
    const saved = contact.messages[contact.messages.length - 1];

    const io = req.app.get('io');
    if (io) {
      io.to('support').emit('support_message', {
        _id: saved._id,
        userId: contactConversationId(contact._id),
        userName: contact.name,
        userPublicId: '',
        userRole: 'guest',
        text: saved.text,
        createdAt: saved.createdAt,
      });
    }

    res.status(201).json({ _id: saved._id, sender: 'guest', text: saved.text, createdAt: saved.createdAt });
  } catch (err) {
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
