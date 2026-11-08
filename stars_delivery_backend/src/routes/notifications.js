const { sendInternalServerError } = require('../security/errorResponse');
const express = require('express');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();
router.use(auth, requireRole('customer', 'provider'));

router.get('/', async (req, res) => {
  try {
    const notifications = await Notification.find({
      userId: req.userId,
      type: 'broadcast',
    })
      .sort({ pinned: -1, createdAt: -1 })
      .limit(50)
      .lean();
    res.json(notifications);
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.put('/:id/read', async (req, res) => {
  try {
    const notif = await Notification.findOne({
      _id: req.params.id,
      userId: req.userId,
      type: 'broadcast',
    });
    if (!notif) return res.status(404).json({ error: 'Not found' });
    // Pinned notifications disappear immediately when read
    if (notif.pinned) {
      await Notification.findByIdAndDelete(req.params.id);
    } else {
      notif.read = true;
      await notif.save();
    }
    res.json({ message: 'Marked as read' });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.put('/read-all', async (req, res) => {
  try {
    // Pinned notifications get deleted; regular ones marked read
    await Notification.deleteMany({ userId: req.userId, type: 'broadcast', pinned: true });
    await Notification.updateMany({ userId: req.userId, type: 'broadcast', read: false }, { read: true });
    res.json({ message: 'All marked as read' });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.get('/unread-count', async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      userId: req.userId,
      type: 'broadcast',
      read: false,
    });
    res.json({ count });
  } catch (err) {
    sendInternalServerError(res);
  }
});

module.exports = router;