const { sendInternalServerError } = require('../security/errorResponse');
const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const PendingProvider = require('../models/PendingProvider');
const PushToken = require('../models/PushToken');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  locationUpdateLimiter,
  locationUpdateIpLimiter,
  pushTokenLimiter,
  pushTokenIpLimiter,
} = require('../security/actionRateLimit');
const {
  validateLocationUpdate,
} = require('../security/locationValidation');
const { isReservedGuestEmail } = require('../services/contactRequest');
const {
  normalizeMobileEmail,
  isValidMobileEmail,
} = require('../security/mobileEmail');
const {
  mobileSessionRotationFilter,
  publicMobileUser,
} = require('../services/mobileSession');
const {
  customerProviderVisibilityFilter,
} = require('../services/orderVisibility');
const {
  isValidAreaForGovernorate,
  canonicalGovernorate,
  governorateKey,
} = require('../services/registrationLocation');
const {
  MIN_MOBILE_PASSWORD_LENGTH,
  MAX_MOBILE_PASSWORD_LENGTH,
  isValidMobilePassword,
} = require('../security/passwordPolicy');

const router = express.Router();
router.use(auth, requireRole('customer', 'provider'));

router.post('/push-token', pushTokenLimiter, pushTokenIpLimiter, async (req, res) => {
  try {
    const token =
      typeof req.body?.token === 'string'
        ? req.body.token.trim()
        : '';
    const platform =
      typeof req.body?.platform === 'string'
        ? req.body.platform.trim().toLowerCase()
        : 'unknown';

    if (!token || token.length > 4096) {
      return res.status(400).json({
        error: 'Valid push token is required',
        code: 'PUSH_TOKEN_REQUIRED',
      });
    }

    await PushToken.findOneAndUpdate(
      { token },
      {
        $set: {
          userId: req.userId,
          platform: ['android', 'ios', 'web'].includes(platform)
            ? platform
            : 'unknown',
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true },
    );

    res.json({ success: true });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.delete('/push-token', async (req, res) => {
  try {
    const token =
      typeof req.body?.token === 'string'
        ? req.body.token.trim()
        : typeof req.query?.token === 'string'
          ? req.query.token.trim()
          : '';

    if (token) {
      await PushToken.deleteOne({ token, userId: req.userId });
    } else {
      await PushToken.deleteMany({ userId: req.userId });
    }

    res.json({ success: true });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.get('/available-providers', requireRole('customer'), async (req, res) => {
  try {
    const now = new Date();
    const area = req.authUser.area || req.query.area || '';
    const filter = {
      role: 'provider',
      status: 'active',
      deleted: { $ne: true },
      isAvailable: { $ne: false },
      $and: [
        {
          $or: [
            { blockedUntil: null },
            { blockedUntil: { $exists: false } },
            { blockedUntil: { $lte: now } },
          ],
        },
        {
          $or: [
            { offerCooldownUntil: null },
            { offerCooldownUntil: { $exists: false } },
            { offerCooldownUntil: { $lte: now } },
          ],
        },
      ],
    };

    const visibility = customerProviderVisibilityFilter({
      area,
      governorate: req.authUser.governorate,
      governorateLevel: req.authUser.governorateLevel === true,
    });
    if (visibility) {
      filter.$or = visibility.$or;
    }

    const count = await User.countDocuments(filter);
    res.json({ count, area });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.put('/location', locationUpdateLimiter, locationUpdateIpLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const validation = validateLocationUpdate({
      latitude: req.body?.latitude,
      longitude: req.body?.longitude,
      previousLatitude: user.lastLatitude,
      previousLongitude: user.lastLongitude,
      previousUpdatedAt: user.lastLocationUpdate,
      isMocked: req.body?.isMocked,
      accuracy: req.body?.accuracy,
      rejectMocked:
        process.env.NODE_ENV === 'production'
        && process.env.ALLOW_MOCK_LOCATION !== 'true',
    });

    if (!validation.ok) {
      return res.status(400).json({
        error: 'Location update rejected',
        code: validation.code,
      });
    }

    // The area chosen at registration is authoritative for order matching.
    // GPS-detected governorate is only a fallback for legacy accounts that
    // never selected one, so a location sync must never overwrite it.
    const registeredArea =
      typeof user.area === 'string' ? user.area.trim() : '';
    const area = req.body?.area;

    user.lastLatitude = validation.latitude;
    user.lastLongitude = validation.longitude;
    user.lastLocationUpdate = new Date();
    user.lastLocationMocked = validation.mocked === true;
    if (!registeredArea && typeof area === 'string') {
      const normalizedArea = area.trim().slice(0, 100);
      if (normalizedArea) {
        user.area = normalizedArea;
      }
    }
    await user.save();

    res.json({ message: 'Location updated', area: user.area });
  } catch (err) {
    console.error('Update location error:', err.message);
    sendInternalServerError(res);
  }
});

router.get('/location', async (req, res) => {
  try {
    const user = await User.findById(req.userId, 'area lastLatitude lastLongitude lastLocationUpdate');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.put('/governorate-level', async (req, res) => {
  try {
    const enabled = req.body.enabled === true;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const derivedGovernorate = governorateKey(user);
    if (!user.governorate && derivedGovernorate) {
      user.governorate = derivedGovernorate;
    }
    user.governorateLevel = enabled;
    await user.save();

    res.json({
      success: true,
      enabled: user.governorateLevel === true,
    });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.put('/area', async (req, res) => {
  try {
    const requestedGovernorate =
      typeof req.body.governorate === 'string'
        ? req.body.governorate.trim()
        : '';
    const requestedArea =
      typeof req.body.area === 'string' ? req.body.area.trim() : '';

    if (
      !requestedGovernorate
      || !requestedArea
      || !isValidAreaForGovernorate(requestedGovernorate, requestedArea)
    ) {
      return res.status(400).json({
        error: 'المحافظة أو القرية/المدينة غير صالحة.',
        code: 'INVALID_AREA',
      });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.governorate =
      canonicalGovernorate(requestedGovernorate) || requestedGovernorate;
    user.area = requestedArea;
    await user.save();

    res.json({
      success: true,
      user: publicMobileUser(user),
    });
  } catch (err) {
    sendInternalServerError(res);
  }
});

// Self-service password change.
// This requires both an authenticated mobile session and
// knowledge of the account's current credential.
router.put('/password', async (req, res) => {
  try {
    const currentPassword =
      typeof req.body.currentPassword === 'string'
        ? req.body.currentPassword
        : '';

    const newPassword =
      typeof req.body.newPassword === 'string'
        ? req.body.newPassword
        : '';

    const confirmPassword =
      typeof req.body.confirmPassword === 'string'
        ? req.body.confirmPassword
        : '';

    if (
      !currentPassword
      || !newPassword
      || !confirmPassword
    ) {
      return res.status(400).json({
        error:
          'Current password, new password, and confirmation are required',
        code: 'PASSWORD_FIELDS_REQUIRED',
      });
    }

    const user =
      await User.findById(
        req.userId,
      ).select('+password');

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    const currentMatches =
      await bcrypt.compare(
        currentPassword,
        user.password,
      );

    if (!currentMatches) {
      return res.status(400).json({
        error: 'Current password is incorrect',
        code: 'CURRENT_PASSWORD_INVALID',
      });
    }

    if (!isValidMobilePassword(newPassword)) {
      return res.status(400).json({
        error:
          `New password must be between ${MIN_MOBILE_PASSWORD_LENGTH} and ${MAX_MOBILE_PASSWORD_LENGTH} characters and must not be an obvious placeholder`,
        code: 'PASSWORD_POLICY',
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        error:
          'New password and confirmation do not match',
        code: 'PASSWORD_CONFIRMATION_MISMATCH',
      });
    }

    const hashedPassword =
      await bcrypt.hash(
        newPassword,
        10,
      );

    const rotationFilter =
      mobileSessionRotationFilter(user);

    if (!rotationFilter) {
      throw new Error(
        'Invalid mobile session version',
      );
    }

    const rotation =
      await User.updateOne(
        {
          _id: user._id,
          role: user.role,
          ...rotationFilter,
        },
        {
          $set: {
            password: hashedPassword,
            mustChangePassword: false,
          },
          $inc: {
            sessionVersion: 1,
          },
        },
        {
          runValidators: true,
        },
      );

    if (rotation.matchedCount !== 1) {
      throw new Error(
        'Concurrent credential rotation',
      );
    }

    const io = req.app.get('io');

    if (io) {
      io.in(
        `user:${user._id}`,
      ).disconnectSockets(true);
    }

    return res.json({
      message: 'Password updated',
    });
  } catch (err) {
    return sendInternalServerError(res);
  }
});


// Self-service recovery email change.
// The email is a login identifier and future recovery destination,
// so changing it requires knowledge of the current credential.
router.put('/email', async (req, res) => {
  try {
    const currentPassword =
      typeof req.body.currentPassword === 'string'
        ? req.body.currentPassword
        : '';

    const newEmail =
      normalizeMobileEmail(
        req.body.newEmail,
      );

    const confirmEmail =
      normalizeMobileEmail(
        req.body.confirmEmail,
      );

    if (
      !currentPassword
      || !newEmail
      || !confirmEmail
    ) {
      return res.status(400).json({
        error:
          'Current password, new email, and confirmation are required',
        code: 'EMAIL_FIELDS_REQUIRED',
      });
    }

    if (
      !isValidMobileEmail(newEmail)
      || isReservedGuestEmail(newEmail)
    ) {
      return res.status(400).json({
        error: 'Invalid email address',
        code: 'EMAIL_INVALID',
      });
    }

    if (newEmail !== confirmEmail) {
      return res.status(400).json({
        error:
          'New email and confirmation do not match',
        code: 'EMAIL_CONFIRMATION_MISMATCH',
      });
    }

    const user =
      await User.findById(
        req.userId,
      ).select('+password');

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    const currentMatches =
      await bcrypt.compare(
        currentPassword,
        user.password,
      );

    if (!currentMatches) {
      return res.status(400).json({
        error: 'Current password is incorrect',
        code: 'CURRENT_PASSWORD_INVALID',
      });
    }

    const currentEmail =
      normalizeMobileEmail(
        user.email,
      );

    if (newEmail === currentEmail) {
      return res.json({
        message: 'Email unchanged',
        email: user.email,
        verified: user.verified === true,
      });
    }

    const [
      existingUser,
      existingPending,
    ] =
      await Promise.all([
        User.exists({
          email: newEmail,
          _id: {
            $ne: user._id,
          },
        }),
        PendingProvider.exists({
          email: newEmail,
        }),
      ]);

    if (
      existingUser
      || existingPending
    ) {
      return res.status(409).json({
        error: 'Email is already in use',
        code: 'EMAIL_IN_USE',
      });
    }

    const rotationFilter =
      mobileSessionRotationFilter(user);

    if (!rotationFilter) {
      throw new Error(
        'Invalid mobile session version',
      );
    }

    const rotation =
      await User.updateOne(
        {
          _id: user._id,
          role: user.role,
          ...rotationFilter,
        },
        {
          $set: {
            email: newEmail,
            verified: false,
          },
          $inc: {
            sessionVersion: 1,
          },
        },
        {
          runValidators: true,
        },
      );

    if (rotation.matchedCount !== 1) {
      throw new Error(
        'Concurrent recovery identity rotation',
      );
    }

    const io = req.app.get('io');

    if (io) {
      io.in(
        `user:${user._id}`,
      ).disconnectSockets(true);
    }

    return res.json({
      message:
        'Email updated. Sign in again with the new email.',
      email: newEmail,
      verified: false,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        error: 'Email is already in use',
        code: 'EMAIL_IN_USE',
      });
    }

    return sendInternalServerError(res);
  }
});

// Profile update intentionally excludes credential changes.
router.put('/profile', async (req, res) => {
  try {
    if (
      Object.prototype.hasOwnProperty.call(
        req.body,
        'password',
      )
    ) {
      return res.status(400).json({
        error:
          'Use the dedicated password endpoint to change credentials',
        code: 'PASSWORD_ENDPOINT_REQUIRED',
      });
    }

    if (
      Object.prototype.hasOwnProperty.call(
        req.body,
        'email',
      )
    ) {
      return res.status(400).json({
        error:
          'Use the dedicated email endpoint to change the recovery identity',
        code: 'EMAIL_ENDPOINT_REQUIRED',
      });
    }

    const {
      fullName,
    } = req.body;

    const update = {};

    if (fullName) {
      update.fullName = fullName;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        error: 'No fields to update',
      });
    }

    const user =
      await User.findByIdAndUpdate(
        req.userId,
        update,
        {
          new: true,
        },
      );

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    return res.json({
      message: 'Profile updated',
    });
  } catch (err) {
    return sendInternalServerError(res);
  }
});

// Frequent items
router.get('/frequent-items', async (req, res) => {
  try {
    const user = await User.findById(req.userId, 'frequentItems');
    res.json({ items: user?.frequentItems || [] });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.post('/frequent-items', async (req, res) => {
  try {
    const { item } = req.body;
    if (!item) return res.status(400).json({ error: 'Item required' });
    const user = await User.findById(req.userId);
    if (!user.frequentItems.includes(item)) {
      user.frequentItems.push(item);
      await user.save();
    }
    res.json({ items: user.frequentItems });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.delete('/frequent-items', async (req, res) => {
  try {
    const { item } = req.body;
    const user = await User.findById(req.userId);
    user.frequentItems = user.frequentItems.filter(i => i !== item);
    await user.save();
    res.json({ items: user.frequentItems });
  } catch (err) {
    sendInternalServerError(res);
  }
});

// Phone numbers management
router.get('/phones', async (req, res) => {
  try {
    const user = await User.findById(req.userId, 'phoneNumbers');
    res.json({ phones: user.phoneNumbers || [] });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.post('/phones', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Phone required' });
    const user = await User.findById(req.userId);
    if (!user.phoneNumbers.some(p => p.number === number)) {
      user.phoneNumbers.push({ number, primary: false });
      await user.save();
    }
    res.json({ phones: user.phoneNumbers });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.delete('/phones', async (req, res) => {
  try {
    const { number } = req.body;
    const user = await User.findById(req.userId);
    const phone = user.phoneNumbers.find(p => p.number === number);
    if (phone?.primary) return res.status(400).json({ error: 'Cannot remove primary phone. Set another as primary first.' });
    user.phoneNumbers = user.phoneNumbers.filter(p => p.number !== number);
    await user.save();
    res.json({ phones: user.phoneNumbers });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.put('/phones/primary', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Phone required' });
    const user = await User.findById(req.userId);
    for (let i = 0; i < user.phoneNumbers.length; i++) {
      user.phoneNumbers[i].primary = user.phoneNumbers[i].number === number;
    }
    user.markModified('phoneNumbers');
    await user.save();
    res.json({ phones: user.phoneNumbers });
  } catch (err) {
    sendInternalServerError(res);
  }
});

module.exports = router;
