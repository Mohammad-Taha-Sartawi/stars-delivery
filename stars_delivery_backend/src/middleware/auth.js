const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  loadSecurityConfig,
} = require('../config');
const {
  isMobileRole,
} = require('./mobileRole');
const {
  isActiveMobileAccount,
  mobileSessionVersionMatches,
} = require('../services/mobileSession');

const JWT_SECRET =
  loadSecurityConfig().jwtSecret;

function rejectInvalidSession(
  res,
  code = 'SESSION_INVALID',
) {
  return res.status(401).json({
    error: 'Invalid session',
    code,
  });
}

function createAuthMiddleware({
  UserModel = User,
  jwtSecret = JWT_SECRET,
} = {}) {
  return async (req, res, next) => {
    const header =
      req.header('Authorization') || '';

    const match =
      /^Bearer\s+(.+)$/i.exec(header);

    const token =
      match?.[1]?.trim();

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    let decoded;

    try {
      decoded =
        jwt.verify(token, jwtSecret);
    } catch (err) {
      return rejectInvalidSession(
        res,
        err?.name === 'TokenExpiredError'
          ? 'TOKEN_EXPIRED'
          : 'SESSION_INVALID',
      );
    }

    if (
      !decoded?.id
      || !mongoose.isValidObjectId(
        decoded.id,
      )
      || !isMobileRole(decoded.role)
    ) {
      return rejectInvalidSession(res);
    }

    let user;

    try {
      user = await UserModel.findById(
        decoded.id,
        'fullName email phoneNumbers role area governorate governorateLevel publicId status deleted sessionVersion blockedUntil offerCooldownUntil',
      );
    } catch (err) {
      return next(err);
    }

    if (
      !user
      || user.role !== decoded.role
    ) {
      return rejectInvalidSession(res);
    }

      if (
        !mobileSessionVersionMatches(
          user,
          decoded.sessionVersion,
        )
      ) {
        return rejectInvalidSession(res);
      }

    if (
      !isActiveMobileAccount(
        user,
        decoded.role,
      )
    ) {
      return res.status(403).json({
        error: 'Account is not active',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    req.userId =
      user._id.toString();

    req.userRole = user.role;
    req.authUser = user;

    return next();
  };
}

const auth = createAuthMiddleware();

module.exports = auth;
module.exports.createAuthMiddleware =
  createAuthMiddleware;
