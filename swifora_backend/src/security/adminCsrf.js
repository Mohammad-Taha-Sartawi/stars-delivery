const crypto = require('node:crypto');

const SAFE_METHODS = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
]);

const TOKEN_BYTES = 32;

function generateAdminCsrfToken() {
  return crypto
    .randomBytes(TOKEN_BYTES)
    .toString('base64url');
}

function ensureAdminCsrfToken(req) {
  if (!req.session) {
    throw new Error(
      'Admin CSRF protection requires session middleware',
    );
  }

  if (
    typeof req.session.adminCsrfToken !== 'string'
    || !req.session.adminCsrfToken
  ) {
    req.session.adminCsrfToken =
      generateAdminCsrfToken();
  }

  return req.session.adminCsrfToken;
}

function suppliedAdminCsrfToken(req) {
  const header =
    typeof req.get === 'function'
      ? req.get('x-csrf-token')
      : req.headers?.['x-csrf-token'];

  if (
    typeof header === 'string'
    && header
  ) {
    return header;
  }

  const bodyToken = req.body?._csrf;

  return typeof bodyToken === 'string'
    ? bodyToken
    : '';
}

function csrfTokensMatch(expected, supplied) {
  if (
    typeof expected !== 'string'
    || typeof supplied !== 'string'
    || !expected
    || !supplied
  ) {
    return false;
  }

  const expectedBuffer =
    Buffer.from(expected);

  const suppliedBuffer =
    Buffer.from(supplied);

  if (
    expectedBuffer.length
    !== suppliedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    expectedBuffer,
    suppliedBuffer,
  );
}

function adminCsrfProtection(req, res, next) {
  let expected;

  try {
    expected = ensureAdminCsrfToken(req);
  } catch (err) {
    return next(err);
  }

  res.locals = res.locals || {};
  res.locals.csrfToken = expected;

  const method =
    String(req.method || 'GET')
      .toUpperCase();

  if (SAFE_METHODS.has(method)) {
    return next();
  }

  const supplied =
    suppliedAdminCsrfToken(req);

  if (
    csrfTokensMatch(
      expected,
      supplied,
    )
  ) {
    return next();
  }

  if (
    req.originalUrl === '/admin/login'
  ) {
    return res
      .status(403)
      .render(
        'login',
        {
          error:
            'انتهت صلاحية الطلب. يرجى إعادة المحاولة.',
        },
      );
  }

  return res.status(403).json({
    error: 'Invalid CSRF token',
    code: 'CSRF_INVALID',
  });
}

module.exports = {
  SAFE_METHODS,
  TOKEN_BYTES,
  generateAdminCsrfToken,
  ensureAdminCsrfToken,
  suppliedAdminCsrfToken,
  csrfTokensMatch,
  adminCsrfProtection,
};
