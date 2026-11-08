const { sendInternalServerError } = require('../security/errorResponse');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Report = require('../models/Report');

router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const [totalDrivers, activeDrivers, totalUsers, activeUsers, totalBlocked, availableDrivers] = await Promise.all([
      User.countDocuments({ role: 'provider' }),
      User.countDocuments({ role: 'provider', status: 'active' }),
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'customer', status: 'active' }),
      User.countDocuments({ status: 'blocked' }),
      User.countDocuments({
        role: 'provider',
        status: 'active',
        deleted: { $ne: true },
        isAvailable: { $ne: false },
        $and: [
          { $or: [{ blockedUntil: null }, { blockedUntil: { $exists: false } }, { blockedUntil: { $lte: now } }] },
          { $or: [{ offerCooldownUntil: null }, { offerCooldownUntil: { $exists: false } }, { offerCooldownUntil: { $lte: now } }] },
        ],
      }),
    ]);

    const commissionAgg = await Order.aggregate([
      { $match: { status: { $in: ['accepted', 'fulfilling', 'completed'] } } },
      { $group: { _id: null, total: { $sum: '$platformCommission' } } }
    ]);
    const totalCommission = commissionAgg[0]?.total || 0;

    const pendingAgg = await Order.aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);
    const pendingAmount = pendingAgg[0]?.total || 0;

    const inactiveDrivers = totalDrivers - activeDrivers;
    const inactiveUsers = totalUsers - activeUsers;

    const driverReportsPending = await Report.countDocuments({ reportType: 'driver', status: { $in: ['in-review', 'in-progress'] } });
    const userReportsPending = await Report.countDocuments({ reportType: 'user', status: { $in: ['in-review', 'in-progress'] } });

    res.json({
      totalDrivers, activeDrivers, inactiveDrivers, availableDrivers,
      totalUsers, activeUsers, inactiveUsers,
      totalCommission, pendingAmount, pendingDrivers: totalBlocked,
      driverReportsPending, userReportsPending
    });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.get('/top-driver', async (req, res) => {
  try {
    const topDriver = await Order.aggregate([
      { $match: { status: { $in: ['accepted', 'fulfilling', 'completed'] }, providerId: { $exists: true, $ne: null } } },
      { $group: { _id: '$providerId', earnings: { $sum: '$providerEarning' }, count: { $sum: 1 } } },
      { $sort: { earnings: -1 } },
      { $limit: 1 }
    ]);

    if (topDriver.length > 0) {
      const driver = await User.findById(topDriver[0]._id, 'fullName').lean();
      res.json({ name: driver ? (driver.fullName) : '---', earnings: topDriver[0].earnings || 0 });
    } else {
      res.json({ name: '---', earnings: 0 });
    }
  } catch (err) {
    sendInternalServerError(res);
  }
});

module.exports = router;
