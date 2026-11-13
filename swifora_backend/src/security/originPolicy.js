function canonicalOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const raw = value.trim();

  if (raw === '*') {
    throw new Error('Wildcard origins are not allowed');
  }

  let parsed;

  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid origin: ${raw}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(
      `Unsupported origin protocol: ${parsed.protocol}`,
    );
  }

  if (
    parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(
      `Origin must contain only scheme, host, and optional port: ${raw}`,
    );
  }

  return parsed.origin;
}

function parseAllowedOrigins(raw = '') {
  if (!raw || !raw.trim()) {
    return [];
  }

  const origins = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(canonicalOrigin);

  return [...new Set(origins)];
}

function requestProtocol(req) {
  if (typeof req.protocol === 'string' && req.protocol) {
    return req.protocol;
  }

  const forwarded =
    req.headers?.['x-forwarded-proto'];

  if (
    typeof forwarded === 'string'
    && forwarded.trim()
  ) {
    return forwarded
      .split(',')[0]
      .trim()
      .toLowerCase();
  }

  return req.socket?.encrypted ? 'https' : 'http';
}

function requestOrigin(req) {
  const host =
    req.headers?.host
    || (
      typeof req.get === 'function'
        ? req.get('host')
        : ''
    );

  if (!host) {
    return null;
  }

  try {
    return canonicalOrigin(
      `${requestProtocol(req)}://${host}`,
    );
  } catch {
    return null;
  }
}

function isOriginAllowed(
  origin,
  req,
  allowedOrigins = [],
) {
  // Native/mobile/non-browser clients commonly send no Origin.
  if (!origin) {
    return true;
  }

  let normalized;

  try {
    normalized = canonicalOrigin(origin);
  } catch {
    return false;
  }

  const sameOrigin = requestOrigin(req);

  if (sameOrigin && normalized === sameOrigin) {
    return true;
  }

  return allowedOrigins.includes(normalized);
}

function createOriginGuard({
  allowedOrigins = [],
} = {}) {
  return function originGuard(req, res, next) {
    const origin = req.headers?.origin;

    if (
      isOriginAllowed(
        origin,
        req,
        allowedOrigins,
      )
    ) {
      return next();
    }

    return res.status(403).json({
      error: 'Origin not allowed',
      code: 'ORIGIN_NOT_ALLOWED',
    });
  };
}

function corsOptionsForRequest(
  req,
  allowedOrigins = [],
) {
  const origin = req.headers?.origin;

  if (
    !origin
    || !isOriginAllowed(
      origin,
      req,
      allowedOrigins,
    )
  ) {
    return {
      origin: false,
      credentials: true,
      optionsSuccessStatus: 204,
    };
  }

  return {
    origin: canonicalOrigin(origin),
    credentials: true,
    optionsSuccessStatus: 204,
  };
}

function socketOriginAllowed(
  req,
  allowedOrigins = [],
) {
  return isOriginAllowed(
    req.headers?.origin,
    req,
    allowedOrigins,
  );
}

module.exports = {
  canonicalOrigin,
  parseAllowedOrigins,
  requestOrigin,
  isOriginAllowed,
  createOriginGuard,
  corsOptionsForRequest,
  socketOriginAllowed,
};
