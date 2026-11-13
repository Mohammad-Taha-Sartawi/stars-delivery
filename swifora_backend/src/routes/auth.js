const {
  normalizeServiceTypes,
} = require('../services/providerServiceTypes');
const { sendInternalServerError } = require('../security/errorResponse');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const PendingProvider = require('../models/PendingProvider');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const passwordRecoveryRouter = require('./passwordRecovery');
const { generatePublicId } = require('../utils/publicId');
const { isMobileRole } = require('../middleware/mobileRole');
const { loadSecurityConfig } = require('../config');
const { isReservedGuestEmail } = require('../services/contactRequest');
const {
  normalizeMobileEmail,
  isValidMobileEmail,
} = require('../security/mobileEmail');
const {
  isActiveMobileAccount,
  publicMobileUser,
  mobileSessionVersion,
  mobileSessionRotationFilter,
} = require('../services/mobileSession');
const { governorateKey } = require('../services/registrationLocation');
const { findActiveAccountByEmail } = require('../services/accountRelease');
const PushToken = require('../models/PushToken');
const {
  MIN_MOBILE_PASSWORD_LENGTH,
  MAX_MOBILE_PASSWORD_LENGTH,
  isValidMobilePassword,
} = require('../security/passwordPolicy');
const {
  createMobileLoginLimiter,
  createMobileLoginAccountLimiter,
  createMobileRegistrationLimiter,
} = require('../security/mobileAuthRateLimit');

const JWT_SECRET = loadSecurityConfig().jwtSecret;
const DUMMY_PASSWORD_HASH =
  '$2a$12$sGnyg4das1q00q6NeIP1SOg243vtjXF8zU8iycDT6Nna.E1CnAr76';

const invalidCredentialsMessage = 'Invalid credentials';
const mobileLoginLimiter = createMobileLoginLimiter();
const mobileLoginAccountLimiter =
  createMobileLoginAccountLimiter();
const mobileRegistrationLimiter =
  createMobileRegistrationLimiter();

const router = express.Router();

router.post('/register', mobileRegistrationLimiter, async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      password,
      role,
      area,
      governorate,
      privacyPolicy,
    } = req.body;
    const registrationArea =
      typeof area === 'string' ? area.trim() : '';
    const registrationGovernorate =
      typeof governorate === 'string' ? governorate.trim() : '';
    const normalizedEmail =
      normalizeMobileEmail(email);

    if (!isMobileRole(role)) {
      return res.status(400).json({ error: 'Invalid registration role' });
    }

    if (
      !isValidMobileEmail(normalizedEmail)
      || isReservedGuestEmail(normalizedEmail)
    ) {
      return res.status(400).json({
        error: 'Invalid email address',
      });
    }

    if (!isValidMobilePassword(password)) {
      return res.status(400).json({
        error:
          `Password must be between ${MIN_MOBILE_PASSWORD_LENGTH} and ${MAX_MOBILE_PASSWORD_LENGTH} characters and must not be an obvious placeholder`,
        code: 'PASSWORD_POLICY',
      });
    }

    const serviceTypes =
      role === 'provider'
        ? normalizeServiceTypes(req.body.serviceTypes)
        : [];

    // A deleted account's email is released here, so it can be reused.
    const existingUser = await findActiveAccountByEmail(normalizedEmail);
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });
    const existingPending = await PendingProvider.findOne({ email: normalizedEmail });
    if (existingPending) return res.status(400).json({ error: 'Email already pending review' });

    const hashed = await bcrypt.hash(password, 10);

    // Providers go through admin approval flow.
    if (role === 'provider') {
      await PendingProvider.create({
        fullName,
        email: normalizedEmail,
        phone,
        password: hashed,
        area: registrationArea,
        governorate: registrationGovernorate,
        serviceTypes,
      });

      return res.status(201).json({
        pending: true,
        message:
          'تم تقديم طلب التسجيل بنجاح. حسابك قيد المراجعة من قبل الإدارة.',
      });
    }

    // Customers register immediately
    const publicId = await generatePublicId();
    const user = await User.create({
      fullName,
      email: normalizedEmail,
      password: hashed,
      role,
      area: registrationArea,
      governorate: registrationGovernorate,
      governorateLevel: false,
      publicId,
      phoneNumbers: [{ number: phone, primary: true }],
      privacyPolicy: privacyPolicy || false,
    });

    const sessionVersion =
      mobileSessionVersion(user);

    if (sessionVersion === null) {
      throw new Error(
        'Invalid mobile session version',
      );
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        sessionVersion,
      },
      JWT_SECRET,
      {
        expiresIn: '7d',
      },
    );

    res.status(201).json({
      token,
      user: { id: user._id, fullName: user.fullName, email: user.email, phone, role: user.role, area: user.area, governorate: user.governorate || '', governorateLevel: user.governorateLevel === true, publicId: user.publicId, mustChangePassword: user.mustChangePassword === true },
    });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.post('/login', mobileLoginLimiter, mobileLoginAccountLimiter, async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const normalizedEmail =
      normalizeMobileEmail(email);

    if (!isMobileRole(role)) {
      return res.status(400).json({ error: 'Invalid login role' });
    }

    if (
      !isValidMobileEmail(normalizedEmail)
      || isReservedGuestEmail(normalizedEmail)
    ) {
      return res.status(400).json({
        error: invalidCredentialsMessage,
      });
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    const suppliedPassword =
      typeof password === 'string'
        ? password
        : '';

    const match =
      await bcrypt.compare(
        suppliedPassword,
        user?.password || DUMMY_PASSWORD_HASH,
      );

    if (!user && role === 'provider') {
      // A driver whose sign-up still waits for admin approval. Answer with a
      // clear status instead of "invalid credentials", and as a 200 so these
      // retries do not count towards the failed-login lockout.
      const pending = await PendingProvider.findOne({
        email: normalizedEmail,
      }).select('+password');
      if (
        pending
        && await bcrypt.compare(suppliedPassword, pending.password || DUMMY_PASSWORD_HASH)
      ) {
        return res.json({
          pending: true,
          code: 'ACCOUNT_PENDING_APPROVAL',
          message:
            'حسابك قيد المراجعة من قبل الإدارة. ستتمكن من تسجيل الدخول بعد الموافقة عليه.',
        });
      }
    }

    if (!user || !match || user.role !== role) {
      return res.status(400).json({
        error: invalidCredentialsMessage,
        code: 'INVALID_CREDENTIALS',
      });
    }


    if (!isActiveMobileAccount(user, role)) {
      return res.status(403).json({
        error: user.deleted
          ? 'تم حذف هذا الحساب. يرجى إنشاء حساب جديد.'
          : 'هذا الحساب غير نشط حالياً.',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    const sessionVersion =
      mobileSessionVersion(user);

    if (sessionVersion === null) {
      throw new Error(
        'Invalid mobile session version',
      );
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        sessionVersion,
      },
      JWT_SECRET,
      {
        expiresIn: '7d',
      },
    );

    const primaryPhone = (user.phoneNumbers || []).find(p => p.primary)?.number || (user.phoneNumbers?.[0]?.number) || '';

    res.json({
      token,
      user: { id: user._id, fullName: user.fullName, email: user.email, phone: primaryPhone, role: user.role, area: user.area, governorate: governorateKey(user) || user.governorate || '', governorateLevel: user.governorateLevel === true, publicId: user.publicId || '', mustChangePassword: user.mustChangePassword === true },
    });
  } catch (err) {
    sendInternalServerError(res);
  }
});

router.use(
  '/password-recovery',
  passwordRecoveryRouter,
);

router.post(
  '/logout',
  auth,
  requireRole('customer', 'provider'),
  async (req, res) => {
    try {
      const rotationFilter =
        mobileSessionRotationFilter(
          req.authUser,
        );

      if (!rotationFilter) {
        throw new Error(
          'Invalid mobile session version',
        );
      }

      const rotation =
        await User.updateOne(
          {
            _id: req.userId,
            role: req.userRole,
            ...rotationFilter,
          },
          {
            $inc: {
              sessionVersion: 1,
            },
          },
        );

      if (rotation.matchedCount !== 1) {
        throw new Error(
          'Concurrent session revocation',
        );
      }

      // Logout ends every session of this account, so stop push delivery to
      // all of its devices too (the app's own token removal can race the
      // revocation and fail with 401).
      await PushToken.deleteMany({ userId: req.userId });

      const io = req.app.get('io');

      if (io) {
        io.in(
          `user:${req.userId}`,
        ).disconnectSockets(true);
      }

      return res.json({
        success: true,
        message: 'Logged out',
      });
    } catch (_err) {
      return sendInternalServerError(res);
    }
  },
);

router.get(
  '/me',
  auth,
  requireRole('customer', 'provider'),
  (req, res) => {
    return res.json({
      user: {
        ...publicMobileUser(
          req.authUser,
        ),
        mustChangePassword:
          req.authUser.mustChangePassword === true,
      },
    });
  },
);

module.exports = router;
