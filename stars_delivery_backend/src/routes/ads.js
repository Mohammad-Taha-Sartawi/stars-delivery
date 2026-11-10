const { sendInternalServerError } = require('../security/errorResponse');
const express = require('express');
const Ad = require('../models/Ad');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { publicAd } = require('../services/adPayload');

const router = express.Router();

router.get('/', auth, requireRole('customer', 'provider'), async (req, res) => {
  try {
    const now = new Date();
    const audience = req.userRole === 'provider'
      ? 'providers'
      : 'customers';

    const ads = await Ad.find({
      isActive: true,
      audience: { $in: ['all', audience] },
      $and: [
        {
          $or: [
            { startsAt: null },
            { startsAt: { $lte: now } },
          ],
        },
        {
          $or: [
            { endsAt: null },
            { endsAt: { $gte: now } },
          ],
        },
      ],
    })
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(5)
      .lean();

    return res.json(ads.map(publicAd));
  } catch (err) {
    return sendInternalServerError(res);
  }
});

module.exports = router;
