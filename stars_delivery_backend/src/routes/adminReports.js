const { sendInternalServerError, sendInternalServerFailure } = require('../security/errorResponse');
const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const {
  createUserNotification,
} = require('../services/mobileNotifications');

router.get('/:type', async (req, res) => {
  try {
    const reports = await Report.find({ reportType: req.params.type })
      .populate('reporterId', 'fullName publicId')
      .sort({ createdAt: -1 });
    res.json({ reports });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.get('/detail/:id', async (req, res) => {
  try {
    const report = await Report.findOne({ reportId: req.params.id });
    if (!report) return res.json({ error: 'الإبلاغ غير موجود' });
    res.json({ report });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.post('/reply/:id', async (req, res) => {
  try {
    const report = await Report.findOne({ reportId: req.params.id });
    if (!report) return res.json({ success: false, message: 'الإبلاغ غير موجود' });
    report.replies.push({
      sender: 'admin',
      text: req.body.text,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    });
    await report.save();

    const io = req.app.get('io');
    await createUserNotification({
      io,
      userId: report.reporterId,
      type: 'report_reply',
      title: 'رد جديد على بلاغك',
      body: String(req.body.text || '').trim(),
      expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).catch(() => {});

    res.json({ success: true, report });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

router.put('/:id/status', async (req, res) => {
  try {
    const report = await Report.findOne({ reportId: req.params.id });
    if (!report) return res.json({ success: false, message: 'الإبلاغ غير موجود' });
    report.status = req.body.status;
    await report.save();

    const io = req.app.get('io');
    const statusLabel = {
      'in-review': 'قيد المراجعة',
      'in-progress': 'قيد المعالجة',
      resolved: 'تم الحل',
      rejected: 'مرفوض',
    }[report.status] || report.status;

    await createUserNotification({
      io,
      userId: report.reporterId,
      type: 'report_reply',
      title: 'تحديث حالة البلاغ',
      body: `أصبحت حالة بلاغك: ${statusLabel}.`,
      expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Report.findOneAndDelete({ reportId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    sendInternalServerFailure(res);
  }
});

module.exports = router;
