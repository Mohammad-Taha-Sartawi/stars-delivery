const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const MOBILE_AUTH_WINDOW_MS =
  15 * 60 * 1000;

const MOBILE_LOGIN_ATTEMPT_LIMIT = 10;
const MOBILE_LOGIN_ACCOUNT_ATTEMPT_LIMIT = 10;
const MOBILE_REGISTRATION_ATTEMPT_LIMIT = 5;

const PASSWORD_RECOVERY_WINDOW_MS =
  15 * 60 * 1000;

const PASSWORD_RECOVERY_REQUEST_IP_LIMIT = 10;
const PASSWORD_RECOVERY_REQUEST_ACCOUNT_LIMIT = 3;
const PASSWORD_RECOVERY_RESET_IP_LIMIT = 20;

const MOBILE_LOGIN_RATE_LIMIT_RESPONSE =
  Object.freeze({
    error:
      'Too many authentication attempts. Please try again later.',
    code: 'AUTH_RATE_LIMITED',
  });

const MOBILE_REGISTRATION_RATE_LIMIT_RESPONSE =
  Object.freeze({
    error:
      'Too many registration attempts. Please try again later.',
    code: 'REGISTRATION_RATE_LIMITED',
  });

const PASSWORD_RECOVERY_RATE_LIMIT_RESPONSE =
  Object.freeze({
    error:
      'Too many password recovery attempts. Please try again later.',
    code: 'PASSWORD_RECOVERY_RATE_LIMITED',
  });

function createMobileLoginLimiter() {
  return rateLimit({
    windowMs: MOBILE_AUTH_WINDOW_MS,
    limit: MOBILE_LOGIN_ATTEMPT_LIMIT,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (_req, res) =>
      res
        .status(429)
        .json(
          MOBILE_LOGIN_RATE_LIMIT_RESPONSE,
        ),
  });
}

function mobileLoginAccountKey(req) {
  const normalizedEmail =
    typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';

  return (
    'mobile-login:email:'
    + crypto
      .createHash('sha256')
      .update(
        normalizedEmail
        || '__invalid_mobile_login__',
      )
      .digest('hex')
  );
}

function createMobileLoginAccountLimiter() {
  return rateLimit({
    windowMs: MOBILE_AUTH_WINDOW_MS,
    limit: MOBILE_LOGIN_ACCOUNT_ATTEMPT_LIMIT,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: mobileLoginAccountKey,
    handler: (_req, res) =>
      res
        .status(429)
        .json(
          MOBILE_LOGIN_RATE_LIMIT_RESPONSE,
        ),
  });
}

function createMobileRegistrationLimiter() {
  return rateLimit({
    windowMs: MOBILE_AUTH_WINDOW_MS,
    limit:
      MOBILE_REGISTRATION_ATTEMPT_LIMIT,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res
        .status(429)
        .json(
          MOBILE_REGISTRATION_RATE_LIMIT_RESPONSE,
        ),
  });
}

function passwordRecoveryAccountKey(req) {
  const normalizedEmail =
    typeof req.body?.email === 'string'
      ? req.body.email
        .trim()
        .toLowerCase()
      : '';

  const identity =
    normalizedEmail
    || '__invalid_recovery_identity__';

  return (
    'password-recovery:email:'
    + crypto
      .createHash('sha256')
      .update(identity)
      .digest('hex')
  );
}

function createPasswordRecoveryRequestIpLimiter() {
  return rateLimit({
    windowMs:
      PASSWORD_RECOVERY_WINDOW_MS,
    limit:
      PASSWORD_RECOVERY_REQUEST_IP_LIMIT,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res
        .status(429)
        .json(
          PASSWORD_RECOVERY_RATE_LIMIT_RESPONSE,
        ),
  });
}

function createPasswordRecoveryRequestAccountLimiter() {
  return rateLimit({
    windowMs:
      PASSWORD_RECOVERY_WINDOW_MS,
    limit:
      PASSWORD_RECOVERY_REQUEST_ACCOUNT_LIMIT,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator:
      passwordRecoveryAccountKey,
    handler: (_req, res) =>
      res
        .status(429)
        .json(
          PASSWORD_RECOVERY_RATE_LIMIT_RESPONSE,
        ),
  });
}

function createPasswordRecoveryResetIpLimiter() {
  return rateLimit({
    windowMs:
      PASSWORD_RECOVERY_WINDOW_MS,
    limit:
      PASSWORD_RECOVERY_RESET_IP_LIMIT,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res
        .status(429)
        .json(
          PASSWORD_RECOVERY_RATE_LIMIT_RESPONSE,
        ),
  });
}

module.exports = {
  MOBILE_AUTH_WINDOW_MS,
  MOBILE_LOGIN_ATTEMPT_LIMIT,
  MOBILE_LOGIN_ACCOUNT_ATTEMPT_LIMIT,
  MOBILE_REGISTRATION_ATTEMPT_LIMIT,
  PASSWORD_RECOVERY_WINDOW_MS,
  PASSWORD_RECOVERY_REQUEST_IP_LIMIT,
  PASSWORD_RECOVERY_REQUEST_ACCOUNT_LIMIT,
  PASSWORD_RECOVERY_RESET_IP_LIMIT,
  MOBILE_LOGIN_RATE_LIMIT_RESPONSE,
  MOBILE_REGISTRATION_RATE_LIMIT_RESPONSE,
  PASSWORD_RECOVERY_RATE_LIMIT_RESPONSE,
  mobileLoginAccountKey,
  passwordRecoveryAccountKey,
  createMobileLoginLimiter,
  createMobileLoginAccountLimiter,
  createMobileRegistrationLimiter,
  createPasswordRecoveryRequestIpLimiter,
  createPasswordRecoveryRequestAccountLimiter,
  createPasswordRecoveryResetIpLimiter,
};
