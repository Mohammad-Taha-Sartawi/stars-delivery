const { sendInternalServerError } = require('../security/errorResponse');
const express = require('express');
const Report = require('../models/Report');
const User = require('../models/User');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  reportCreateLimiter,
  reportCreateIpLimiter,
} = require('../security/actionRateLimit');

const router = express.Router();
router.use(auth, requireRole('customer', 'provider'));

router.post('/', reportCreateLimiter, reportCreateIpLimiter, async (req, res) => {
  try {
    const reportedPublicId =
      typeof req.body?.reportedPublicId === 'string'
        ? req.body.reportedPublicId.trim()
        : '';
    const content =
      typeof req.body?.content === 'string'
        ? req.body.content.trim()
        : '';
    const { reportType } = req.body;

    if (!reportedPublicId || !content) {
      return res.status(400).json({ error: 'ID ووصف المشكلة مطلوبان' });
    }

    if (reportedPublicId.length > 50 || content.length > 2000) {
      return res.status(400).json({
        error: 'المحتوى أطول من الحد المسموح.',
        code: 'REPORT_TOO_LONG',
      });
    }

    const normalizedReportType =
      reportType === 'user' ? 'user' : 'driver';
    const targetRole =
      normalizedReportType === 'driver' ? 'provider' : 'customer';
    const target = await User.findOne({
      publicId: reportedPublicId,
      role: targetRole,
      deleted: { $ne: true },
    }).select('_id').lean();

    if (!target) {
      return res.status(400).json({
        error: 'لا يوجد حساب مطابق لهذا المعرف.',
      });
    }

    const reportId = `RPT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const report = await Report.create({
      reportId,
      reportType: normalizedReportType,
      reporterId: req.userId,
      reporter: req.userId,
      reportedPublicId,
      reportedUserId: target._id,
      category: normalizedReportType === 'driver' ? 'الابلاغ عن سائق' : 'الابلاغ عن زبون',
      content,
    });

    res.status(201).json({ success: true, report });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.get('/my', async (req, res) => {
  try {
    const reports = await Report.find({ reporterId: req.userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    res.json(reports);
  } catch (err) {
    sendInternalServerError(res);
  }
});

module.exports = router;
