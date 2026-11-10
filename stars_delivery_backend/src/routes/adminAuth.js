const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const requireAdminSession = require('../middleware/requireAdminSession');
const { ADMIN_SESSION_COOKIE } = require('../middleware/adminSession');
const { adminCsrfProtection } = require('../security/adminCsrf');
const { isValidAdminPassword, MIN_ADMIN_PASSWORD_LENGTH } = require('../security/passwordPolicy');
const {
  generateTotpSecret,
  verifyTotpCode,
  buildTotpUri,
  generateRecoveryCodes,
  hashRecoveryCode,
} = require('../security/totp');

const router = express.Router();

const invalidCredentialsMessage = 'اسم المستخدم أو كلمة المرور غير صحيحة';
const DUMMY_ADMIN_PASSWORD_HASH =
  '$2a$12$sGnyg4das1q00q6NeIP1SOg243vtjXF8zU8iycDT6Nna.E1CnAr76';
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => res.status(429).render('login', { error: invalidCredentialsMessage }),
});

function adminLoginAccountKey(req) {
  const identifier =
    typeof req.body?.identifier === 'string'
      ? req.body.identifier.trim().toLowerCase()
      : '';

  return (
    'admin-login:email:'
    + crypto
      .createHash('sha256')
      .update(identifier || '__invalid_admin_login__')
      .digest('hex')
  );
}

const adminLoginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: adminLoginAccountKey,
  handler: (req, res) => res.status(429).render('login', { error: invalidCredentialsMessage }),
});

async function syncAdminSessionVersion(req, version) {
  if (!req.session?.admin) return;

  req.session.admin.sessionVersion = version;

  if (typeof req.session.save === 'function') {
    await new Promise((resolve) => {
      req.session.save(() => resolve());
    });
  }

  const io = req.app?.get?.('io');
  const adminId = req.session.admin.id;

  if (io && adminId) {
    io.in(`admin:${adminId}`).disconnectSockets(true);
  }
}

router.get('/login', adminCsrfProtection, (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('login', { error: null });
});

router.post('/login', adminCsrfProtection, adminLoginLimiter, adminLoginAccountLimiter, async (req, res) => {
  try {
    const identifier = String(req.body.identifier || '').trim().toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const admin = identifier
      ? await User.findOne({ email: identifier, role: 'admin', deleted: { $ne: true }, status: 'active' }).select('+password +adminTotpSecret +adminTotpRecoveryCodeHashes')
      : null;

    const passwordMatches = await bcrypt.compare(
      password,
      admin?.password || DUMMY_ADMIN_PASSWORD_HASH,
    );

    if (!admin || !passwordMatches) {
      return res.status(401).render('login', { error: invalidCredentialsMessage });
    }

    if (admin.adminTotpEnabled === true) {
      const twoFactorCode = typeof req.body.twoFactorCode === 'string'
        ? req.body.twoFactorCode.trim()
        : '';
      const validTotp = verifyTotpCode(
        admin.adminTotpSecret,
        twoFactorCode,
      );
      const recoveryDigest = hashRecoveryCode(
        twoFactorCode,
      );
      const recoveryIndex = validTotp
        ? -1
        : (admin.adminTotpRecoveryCodeHashes || [])
          .indexOf(recoveryDigest);

      if (!validTotp && recoveryIndex === -1) {
        return res.status(401).render('login', { error: invalidCredentialsMessage });
      }

      if (recoveryIndex !== -1) {
        admin.adminTotpRecoveryCodeHashes.splice(
          recoveryIndex,
          1,
        );
        await admin.save();
      }
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).render('login', { error: 'حدث خطأ. يرجى المحاولة مرة أخرى.' });
      req.session.admin = {
        id: admin._id.toString(),
        email: admin.email,
        fullName: admin.fullName,
        role: 'admin',
        sessionVersion: admin.sessionVersion ?? 0,
      };
      req.session.save((saveErr) => {
        if (saveErr) return res.status(500).render('login', { error: 'حدث خطأ. يرجى المحاولة مرة أخرى.' });
        return res.redirect('/admin');
      });
    });
  } catch {
    return res.status(401).render('login', { error: invalidCredentialsMessage });
  }
});

router.post('/reset-password', requireAdminSession, adminCsrfProtection, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const admin = await User.findOne({
      _id: req.session.admin.id,
      role: 'admin',
      deleted: { $ne: true },
      status: 'active',
    }).select('+password');
    if (!admin || !(await bcrypt.compare(currentPassword || '', admin.password))) {
      return res.json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
    }
    if (!isValidAdminPassword(newPassword)) {
      return res.json({ success: false, message: `كلمة المرور الجديدة يجب أن تكون ${MIN_ADMIN_PASSWORD_LENGTH} حرفاً على الأقل` });
    }
    if (newPassword !== confirmPassword) {
      return res.json({ success: false, message: 'كلمة المرور وتأكيدها غير متطابقين' });
    }

    admin.password = await bcrypt.hash(newPassword, 12);
    admin.sessionVersion =
      (Number.isSafeInteger(admin.sessionVersion)
        ? admin.sessionVersion
        : 0) + 1;
    await admin.save();

    // Keep the current browser signed in while invalidating every other
    // administrator session for this account.
    await syncAdminSessionVersion(
      req,
      admin.sessionVersion,
    );

    return res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch {
    return res.status(500).json({ success: false, message: 'حدث خطأ. يرجى المحاولة مرة أخرى.' });
  }
});

router.get('/2fa/status', requireAdminSession, adminCsrfProtection, async (req, res) => {
  try {
    const admin = await User.findOne({
      _id: req.session.admin.id,
      role: 'admin',
      status: 'active',
      deleted: { $ne: true },
    })
      .select('adminTotpEnabled adminTotpEnabledAt')
      .lean();

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'انتهت الجلسة.',
      });
    }

    return res.json({
      success: true,
      enabled: admin.adminTotpEnabled === true,
      enabledAt: admin.adminTotpEnabledAt || null,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ. يرجى المحاولة مرة أخرى.',
    });
  }
});

router.post('/2fa/setup', requireAdminSession, adminCsrfProtection, async (req, res) => {
  try {
    const admin = await User.findOne({
      _id: req.session.admin.id,
      role: 'admin',
      status: 'active',
      deleted: { $ne: true },
    }).select('+password +adminTotpSecret');

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'انتهت الجلسة.',
      });
    }

    if (admin.adminTotpEnabled === true) {
      return res.status(409).json({
        success: false,
        message: 'المصادقة الثنائية مفعّلة بالفعل.',
      });
    }

    const secret = generateTotpSecret();
    admin.adminTotpSecret = secret;
    await admin.save();

    return res.json({
      success: true,
      secret,
      otpauthUri: buildTotpUri({
        secret,
        email: admin.email,
      }),
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ. يرجى المحاولة مرة أخرى.',
    });
  }
});

router.post('/2fa/enable', requireAdminSession, adminCsrfProtection, async (req, res) => {
  try {
    const code = typeof req.body?.code === 'string'
      ? req.body.code.trim()
      : '';
    const admin = await User.findOne({
      _id: req.session.admin.id,
      role: 'admin',
      status: 'active',
      deleted: { $ne: true },
    }).select('+password +adminTotpSecret +adminTotpRecoveryCodeHashes');

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'انتهت الجلسة.',
      });
    }

    if (!admin.adminTotpSecret) {
      return res.status(400).json({
        success: false,
        message: 'ابدأ إعداد المصادقة الثنائية أولاً.',
      });
    }

    if (!verifyTotpCode(admin.adminTotpSecret, code)) {
      return res.status(400).json({
        success: false,
        message: 'رمز التحقق غير صحيح.',
      });
    }

    const recoveryCodes = generateRecoveryCodes();
    admin.adminTotpEnabled = true;
    admin.adminTotpEnabledAt = new Date();
    admin.adminTotpRecoveryCodeHashes =
      recoveryCodes.map(hashRecoveryCode);
    admin.sessionVersion =
      (Number.isSafeInteger(admin.sessionVersion)
        ? admin.sessionVersion
        : 0) + 1;
    await admin.save();
    await syncAdminSessionVersion(
      req,
      admin.sessionVersion,
    );

    return res.json({
      success: true,
      message: 'تم تفعيل المصادقة الثنائية.',
      recoveryCodes,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ. يرجى المحاولة مرة أخرى.',
    });
  }
});

router.post('/2fa/disable', requireAdminSession, adminCsrfProtection, async (req, res) => {
  try {
    const password = typeof req.body?.password === 'string'
      ? req.body.password
      : '';
    const code = typeof req.body?.code === 'string'
      ? req.body.code.trim()
      : '';
    const admin = await User.findOne({
      _id: req.session.admin.id,
      role: 'admin',
      status: 'active',
      deleted: { $ne: true },
    }).select('+password +adminTotpSecret +adminTotpRecoveryCodeHashes');

    if (
      !admin
      || !(await bcrypt.compare(password, admin.password))
    ) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور غير صحيحة.',
      });
    }

    if (admin.adminTotpEnabled === true) {
      const validTotp = verifyTotpCode(
        admin.adminTotpSecret,
        code,
      );
      const recoveryDigest = hashRecoveryCode(code);
      const recoveryIndex = validTotp
        ? -1
        : (admin.adminTotpRecoveryCodeHashes || [])
          .indexOf(recoveryDigest);

      if (!validTotp && recoveryIndex === -1) {
        return res.status(400).json({
          success: false,
          message: 'رمز التحقق غير صحيح.',
        });
      }
    }

    admin.adminTotpEnabled = false;
    admin.adminTotpSecret = '';
    admin.adminTotpRecoveryCodeHashes = [];
    admin.adminTotpEnabledAt = null;
    admin.sessionVersion =
      (Number.isSafeInteger(admin.sessionVersion)
        ? admin.sessionVersion
        : 0) + 1;
    await admin.save();
    await syncAdminSessionVersion(
      req,
      admin.sessionVersion,
    );

    return res.json({
      success: true,
      message: 'تم تعطيل المصادقة الثنائية.',
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ. يرجى المحاولة مرة أخرى.',
    });
  }
});

router.post('/logout', requireAdminSession, adminCsrfProtection, (req, res) => {
  const adminId = req.session?.admin?.id;
  const io = req.app?.get?.('io');

  req.session.destroy(() => {
    if (io && adminId) {
      io.in(`admin:${adminId}`).disconnectSockets(true);
    }

    res.clearCookie(ADMIN_SESSION_COOKIE);
    res.redirect('/admin/login');
  });
});

module.exports = router;
