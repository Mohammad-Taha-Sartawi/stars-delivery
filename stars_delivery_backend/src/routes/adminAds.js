const {
  sendInternalServerError,
  sendInternalServerFailure,
} = require('../security/errorResponse');
const express = require('express');
const mongoose = require('mongoose');
const Ad = require('../models/Ad');
const { normalizeAdPayload } = require('../services/adPayload');
const {
  adImageUpload,
  adImageUploadErrorMessage,
  finalizeAdImageFiles,
  removeAdImageFiles,
  deleteAdImageByUrl,
} = require('../services/adImageStorage');

const router = express.Router();

function serializeAd(ad) {
  return {
    _id: ad._id.toString(),
    title: ad.title || '',
    body: ad.body || '',
    images: Array.isArray(ad.images) ? ad.images : [],
    audience: ad.audience || 'all',
    isActive: ad.isActive === true,
    startsAt: ad.startsAt || null,
    endsAt: ad.endsAt || null,
    sortOrder: ad.sortOrder || 0,
    createdAt: ad.createdAt || null,
    updatedAt: ad.updatedAt || null,
  };
}

function adImages(files) {
  return (Array.isArray(files) ? files : [])
    .map((file) => file.publicUrl)
    .filter(Boolean);
}

function uploadMiddleware(req, res, next) {
  adImageUpload(req, res, async (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: adImageUploadErrorMessage(error),
      });
    }

    try {
      await finalizeAdImageFiles(req.files);
      return next();
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        message: adImageUploadErrorMessage(validationError),
      });
    }
  });
}

async function cleanupRequestFiles(req) {
  await removeAdImageFiles(req.files);
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

router.post('/', uploadMiddleware, async (req, res) => {
  const newImages = adImages(req.files);

  try {
    const normalized = normalizeAdPayload(req.body, {
      imageCount: newImages.length,
    });

    if (!normalized.ok) {
      await cleanupRequestFiles(req);
      return res.status(400).json({
        success: false,
        message: normalized.message,
      });
    }

    const ad = await Ad.create({
      ...normalized.value,
      images: newImages,
      createdBy: req.session.admin.id,
    });

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء الإعلان.',
      ad: serializeAd(ad),
    });
  } catch (err) {
    await cleanupRequestFiles(req);
    return sendInternalServerFailure(res);
  }
});

router.put('/:id', uploadMiddleware, async (req, res) => {
  const newImages = adImages(req.files);

  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      await cleanupRequestFiles(req);
      return res.status(404).json({
        success: false,
        message: 'الإعلان غير موجود.',
      });
    }

    const existing = await Ad.findById(req.params.id).lean();

    if (!existing) {
      await cleanupRequestFiles(req);
      return res.status(404).json({
        success: false,
        message: 'الإعلان غير موجود.',
      });
    }

    const existingImages = Array.isArray(existing.images)
      ? existing.images
      : [];
    const images = newImages.length > 0
      ? newImages
      : existingImages;

    const normalized = normalizeAdPayload(req.body, {
      imageCount: images.length,
    });

    if (!normalized.ok) {
      await cleanupRequestFiles(req);
      return res.status(400).json({
        success: false,
        message: normalized.message,
      });
    }

    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...normalized.value,
          images,
        },
      },
      { new: true, runValidators: true },
    ).lean();

    if (!ad) {
      await cleanupRequestFiles(req);
      return res.status(404).json({
        success: false,
        message: 'الإعلان غير موجود.',
      });
    }

    if (newImages.length > 0) {
      await Promise.all(
        existingImages
          .filter((image) => !newImages.includes(image))
          .map(deleteAdImageByUrl),
      );
    }

    return res.json({
      success: true,
      message: 'تم تحديث الإعلان.',
      ad: serializeAd(ad),
    });
  } catch (err) {
    await cleanupRequestFiles(req);
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

    await Promise.all(
      (deleted.images || []).map(deleteAdImageByUrl),
    );

    return res.json({
      success: true,
      message: 'تم حذف الإعلان.',
    });
  } catch (err) {
    return sendInternalServerFailure(res);
  }
});

module.exports = router;
