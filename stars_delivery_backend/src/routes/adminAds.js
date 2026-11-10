const {
  sendInternalServerError,
  sendInternalServerFailure,
} = require('../security/errorResponse');
const express = require('express');
const mongoose = require('mongoose');
const Ad = require('../models/Ad');
const { normalizeAdPayload } = require('../services/adPayload');

const router = express.Router();

function serializeAd(ad) {
  return {
    _id: ad._id.toString(),
    title: ad.title || '',
    body: ad.body || '',
    imageUrl: ad.imageUrl || '',
    audience: ad.audience || 'all',
    isActive: ad.isActive === true,
    startsAt: ad.startsAt || null,
    endsAt: ad.endsAt || null,
    sortOrder: ad.sortOrder || 0,
    createdAt: ad.createdAt || null,
    updatedAt: ad.updatedAt || null,
  };
}

router.get('/', async (req, res) => {
  try {
    const ads = await Ad.find({})
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    return res.json(ads.map(serializeAd));
  } catch (err) {
    return sendInternalServerError(res);
  }
});

router.post('/', async (req, res) => {
  try {
    const normalized = normalizeAdPayload(req.body);

    if (!normalized.ok) {
      return res.status(400).json({
        success: false,
        message: normalized.message,
      });
    }

    const ad = await Ad.create({
      ...normalized.value,
      createdBy: req.session.admin.id,
    });

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء الإعلان.',
      ad: serializeAd(ad),
    });
  } catch (err) {
    return sendInternalServerFailure(res);
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: 'الإعلان غير موجود.',
      });
    }

    const normalized = normalizeAdPayload(req.body);

    if (!normalized.ok) {
      return res.status(400).json({
        success: false,
        message: normalized.message,
      });
    }

    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      { $set: normalized.value },
      { new: true, runValidators: true },
    ).lean();

    if (!ad) {
      return res.status(404).json({
        success: false,
        message: 'الإعلان غير موجود.',
      });
    }

    return res.json({
      success: true,
      message: 'تم تحديث الإعلان.',
      ad: serializeAd(ad),
    });
  } catch (err) {
    return sendInternalServerFailure(res);
  }
});

router.put('/:id/status', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: 'الإعلان غير موجود.',
      });
    }

    const isActive = req.body?.isActive;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'حالة الإعلان غير صالحة.',
      });
    }

    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive } },
      { new: true },
    ).lean();

    if (!ad) {
      return res.status(404).json({
        success: false,
        message: 'الإعلان غير موجود.',
      });
    }

    return res.json({
      success: true,
      message: isActive ? 'تم تفعيل الإعلان.' : 'تم إيقاف الإعلان.',
      ad: serializeAd(ad),
    });
  } catch (err) {
    return sendInternalServerFailure(res);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: 'الإعلان غير موجود.',
      });
    }

    const deleted = await Ad.findByIdAndDelete(
      req.params.id,
    ).lean();

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'الإعلان غير موجود.',
      });
    }

    return res.json({
      success: true,
      message: 'تم حذف الإعلان.',
    });
  } catch (err) {
    return sendInternalServerFailure(res);
  }
});

module.exports = router;
