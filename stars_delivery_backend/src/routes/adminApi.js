const { sendInternalServerError } = require('../security/errorResponse');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Report = require('../models/Report');
const {
  orderStatBoundaries,
  normalizeOrderTypeCounts,
} = require('../services/orderStats');

router.get('/stats', async (req, res) => {
  try {
    const [totalDrivers, activeDrivers, inactiveDrivers, totalUsers, activeUsers, totalBlocked] = await Promise.all([
      User.countDocuments({ role: 'provider' }),
      // Drivers who kept receiving orders enabled.
      User.countDocuments({
        role: 'provider',
        status: 'active',
        deleted: { $ne: true },
        isAvailable: { $ne: false },
      }),
      // Drivers who switched themselves unavailable for new orders.
      User.countDocuments({
        role: 'provider',
        status: 'active',
        deleted: { $ne: true },
        isAvailable: false,
      }),
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'customer', status: 'active' }),
      User.countDocuments({ status: 'blocked' }),
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

    const inactiveUsers = totalUsers - activeUsers;

    const { startOfToday, startOfMonth } = orderStatBoundaries();
    const orderTypeRows = await Order.aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      {
        $group: {
          _id: '$type',
          month: { $sum: 1 },
          today: {
            $sum: {
              $cond: [{ $gte: ['$createdAt', startOfToday] }, 1, 0],
            },
          },
          accepted: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$status',
                    ['accepted', 'fulfilling', 'completed'],
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
    const orderTypeCounts = normalizeOrderTypeCounts(orderTypeRows);

    const driverReportsPending = await Report.countDocuments({ reportType: 'driver', status: { $in: ['in-review', 'in-progress'] } });
    const userReportsPending = await Report.countDocuments({ reportType: 'user', status: { $in: ['in-review', 'in-progress'] } });

    res.json({
      totalDrivers, activeDrivers, inactiveDrivers,
      totalUsers, activeUsers, inactiveUsers,
      totalCommission, pendingAmount, pendingDrivers: totalBlocked,
      driverReportsPending, userReportsPending,
      orderTypeCounts,
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
