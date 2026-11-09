const multer = require('multer');
const {
  normalizeServiceTypes,
} = require('../services/providerServiceTypes');
const {
  MAX_PROVIDER_DOCUMENT_SIZE,
  REQUIRED_PROVIDER_DOCUMENT_FIELDS,
  hasProviderDocumentUploads,
  inspectProviderDocumentFiles,
  persistProviderDocumentFiles,
  deleteProviderDocuments,
} = require('../services/providerDocumentStorage');
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
} = require('../services/mobileSession');
const { governorateKey } = require('../services/registrationLocation');
const {
  MIN_MOBILE_PASSWORD_LENGTH,
  MAX_MOBILE_PASSWORD_LENGTH,
  isValidMobilePassword,
} = require('../security/passwordPolicy');
const {
  createMobileLoginLimiter,
  createMobileRegistrationLimiter,
} = require('../security/mobileAuthRateLimit');

const JWT_SECRET = loadSecurityConfig().jwtSecret;

const invalidCredentialsMessage = 'Invalid credentials';
const mobileLoginLimiter = createMobileLoginLimiter();
const mobileRegistrationLimiter =
  createMobileRegistrationLimiter();

const router = express.Router();

const providerRegistrationUpload =
  multer({
    storage:
      multer.memoryStorage(),
    limits: {
      fileSize:
        MAX_PROVIDER_DOCUMENT_SIZE,
      files: 1,
      fields: 12,
    },
  }).fields(
    REQUIRED_PROVIDER_DOCUMENT_FIELDS
      .map(({ fieldName }) => ({
        name: fieldName,
        maxCount: 1,
      })),
  );

function providerRegistrationDocuments(
  req,
  res,
  next,
) {
  providerRegistrationUpload(
    req,
    res,
    (error) => {
      if (!error) {
        next();
        return;
      }

      res.status(400).json({
        error:
          'Invalid provider documents',
        code:
          'INVALID_PROVIDER_DOCUMENT',
      });
    },
  );
}

router.post('/register', mobileRegistrationLimiter, providerRegistrationDocuments, async (req, res) => {
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
    const licenseNotAvailable =
      req.body.licenseNotAvailable === true
      || req.body.licenseNotAvailable === 'true';
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

    let inspectedProviderDocuments =
      null;

    if (role === 'provider') {
      if (licenseNotAvailable) {
        if (hasProviderDocumentUploads(req.files)) {
          return res.status(400).json({
            error:
              'Provider documents cannot be uploaded when no license is declared.',
            code: 'INVALID_PROVIDER_DOCUMENT',
          });
        }
        inspectedProviderDocuments = [];
      } else {
        try {
          inspectedProviderDocuments =
            inspectProviderDocumentFiles(
              req.files,
            );
        } catch (error) {
          return res.status(400).json({
            error:
              'The driver-license document must be a valid JPEG or PNG image.',
            code:
              error?.code
              || 'INVALID_PROVIDER_DOCUMENT',
          });
        }
      }
    } else if (
      hasProviderDocumentUploads(
        req.files,
      )
    ) {
      return res.status(400).json({
        error:
          'Provider documents are only accepted for provider registration.',
        code:
          'INVALID_PROVIDER_DOCUMENT',
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });
    const existingPending = await PendingProvider.findOne({ email: normalizedEmail });
    if (existingPending) return res.status(400).json({ error: 'Email already pending review' });

    const hashed = await bcrypt.hash(password, 10);

    // Providers go through admin approval flow.
    if (role === 'provider') {
      let providerDocuments = [];

      try {
        if (!licenseNotAvailable) {
          providerDocuments =
            await persistProviderDocumentFiles(
              inspectedProviderDocuments,
            );
        }

        await PendingProvider.create({
          fullName,
          email:
            normalizedEmail,
          phone,
          password:
            hashed,
          area: registrationArea,
          governorate:
            registrationGovernorate,
          licenseNotAvailable,
          serviceTypes,
          providerDocuments,
        });
      } catch (error) {
        if (providerDocuments.length > 0) {
          await deleteProviderDocuments(
            providerDocuments,
          ).catch(() => {});
        }

        if (
          error?.code
          === 'PROVIDER_DOCUMENT_STORAGE_UNAVAILABLE'
        ) {
          return res.status(503).json({
            error:
              'Provider document storage is temporarily unavailable.',
            code:
              'PROVIDER_DOCUMENT_STORAGE_UNAVAILABLE',
          });
        }

        throw error;
      }

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

router.post('/login', mobileLoginLimiter, async (req, res) => {
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

    if (!user) {
      return res.status(400).json({
        error: invalidCredentialsMessage,
      });
    }

    const match =
      await bcrypt.compare(
        password,
        user.password,
      );

    if (!match || user.role !== role) {
      return res.status(400).json({
        error: invalidCredentialsMessage,
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
