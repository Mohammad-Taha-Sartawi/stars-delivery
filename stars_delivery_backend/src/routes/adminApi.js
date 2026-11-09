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
    const [totalDrivers, activeDrivers, inactiveDrivers, totalUsers, activeUsers] = await Promise.all([
      User.countDocuments({ role: 'provider', deleted: { $ne: true } }),
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
      User.countDocuments({ role: 'customer', deleted: { $ne: true } }),
      User.countDocuments({
        role: 'customer',
        status: 'active',
        deleted: { $ne: true },
      }),
    ]);

    const { startOfToday, startOfMonth } = orderStatBoundaries();

    const commissionAgg = await Order.aggregate([
      {
        $match: {
          status: { $in: ['accepted', 'fulfilling', 'completed'] },
          $expr: {
            $gte: [
              { $ifNull: ['$acceptedAt', '$createdAt'] },
              startOfToday,
            ],
          },
        },
      },
      { $group: { _id: null, total: { $sum: '$platformCommission' } } }
    ]);
    const totalCommission = commissionAgg[0]?.total || 0;

    // Drivers who still have unpaid platform commission and the amount due.
    // Commission accrued after the driver's last payment timestamp is unpaid;
    // legacy commissionPaid accounts without a timestamp are fully settled.
    const legacyPaidCutoff = new Date('9999-12-31T23:59:59.999Z');
    const noPaymentCutoff = new Date(0);
    const unpaidCommissionAgg = await Order.aggregate([
      {
        $match: {
          status: { $in: ['accepted', 'fulfilling', 'completed'] },
          providerId: { $ne: null },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'providerId',
          foreignField: '_id',
          as: 'provider',
        },
      },
      { $unwind: '$provider' },
      { $match: { 'provider.role': 'provider' } },
      {
        $addFields: {
          dueAt: { $ifNull: ['$acceptedAt', '$createdAt'] },
          cutoff: {
            $cond: [
              {
                $ne: [
                  { $ifNull: ['$provider.commissionPaidAt', null] },
                  null,
                ],
              },
              '$provider.commissionPaidAt',
              {
                $cond: [
                  { $eq: ['$provider.commissionPaid', true] },
                  legacyPaidCutoff,
                  noPaymentCutoff,
                ],
              },
            ],
          },
        },
      },
      { $match: { $expr: { $gt: ['$dueAt', '$cutoff'] } } },
      {
        $group: {
          _id: '$providerId',
          unpaid: { $sum: '$platformCommission' },
        },
      },
      { $match: { unpaid: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          pendingAmount: { $sum: '$unpaid' },
          pendingDrivers: { $sum: 1 },
        },
      },
    ]);
    const pendingAmount = unpaidCommissionAgg[0]?.pendingAmount || 0;
    const pendingDrivers = unpaidCommissionAgg[0]?.pendingDrivers || 0;

    const inactiveUsers = totalUsers - activeUsers;

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
      totalCommission, pendingAmount, pendingDrivers,
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
