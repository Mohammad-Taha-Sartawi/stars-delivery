const AdminAuditLog = require('../models/AdminAuditLog');

const SAFE_METHODS = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
]);

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const result = {};

  for (const key of Object.keys(value).slice(0, 50)) {
    const entry = value[key];

    if (
      typeof entry === 'string'
      || typeof entry === 'number'
      || typeof entry === 'boolean'
    ) {
      result[key] = String(entry).slice(0, 200);
    }
  }

  return result;
}

function adminAuditLogger(req, res, next) {
  const admin = req.session?.admin;
  const method = String(req.method || '').toUpperCase();
  const path = String(req.path || '');

  const sensitiveDocumentRead =
    method === 'GET'
    && /\/documents(?:\/|$)/.test(path);

  if (
    !admin?.id
    || (SAFE_METHODS.has(method) && !sensitiveDocumentRead)
  ) {
    return next();
  }

  res.on('finish', () => {
    const bodyKeys =
      req.body
      && typeof req.body === 'object'
      && !Array.isArray(req.body)
        ? Object.keys(req.body)
          .slice(0, 50)
          .map((key) => String(key).slice(0, 100))
        : [];

    AdminAuditLog.create({
      actorId: admin.id,
      actorEmail: admin.email || '',
      method: method.slice(0, 16),
      path: path.slice(0, 500),
      statusCode: Number.isInteger(res.statusCode)
        ? res.statusCode
        : null,
      ip: String(req.ip || '').slice(0, 100),
      userAgent: String(
        req.get?.('user-agent') || '',
      ).slice(0, 500),
      targetParams: plainObject(req.params),
      query: plainObject(req.query),
      bodyKeys,
    }).catch(() => {});
  });

  return next();
}

module.exports = adminAuditLogger;
