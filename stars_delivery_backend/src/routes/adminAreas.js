const { sendInternalServerError } = require('../security/errorResponse');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const {
  buildGovernorateStats,
} = require('../services/registrationLocation');

router.get('/', async (req, res) => {
  try {
    const drivers = await User.find({ role: 'provider' }).lean();
    const users = await User.find({ role: 'customer' }).lean();

    const { stats, governorateOrder } = buildGovernorateStats(
      drivers,
      users,
    );

    res.json({
      stats,
      governorateOrder,
      totalDrivers: drivers.length,
      totalUsers: users.length,
    });
  } catch (err) {
    sendInternalServerError(res);
  }
});

module.exports = router;
