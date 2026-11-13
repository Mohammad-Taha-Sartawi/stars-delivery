require('dotenv').config();
const { parseAllowedOrigins } = require('./security/originPolicy');

const MIN_SECRET_LENGTH = 32;
const INSECURE_SECRET_VALUES = new Set([
  'stars_delivery_secret_key_2026',
  'tahakum-secret-key-2025',
  'replace-with-a-random-secret-at-least-32-characters',
  'replace-with-a-different-random-secret-at-least-32-chars',
]);

function isPlaceholderSecret(secret) {
  const normalized = secret.toLowerCase();
  return INSECURE_SECRET_VALUES.has(normalized)
    || /^(replace|your|change|example|placeholder|dummy)[-_ ]/.test(normalized)
    || /^(.)(\1){7,}$/.test(normalized);
}

function requiredValue(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validateSecret(name, value) {
  if (!value || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  const secret = value.trim();
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  if (isPlaceholderSecret(secret)) {
    throw new Error(`${name} must not be a placeholder or known default`);
  }
  return secret;
}

function loadSecurityConfig(env = process.env) {
  const jwtSecret = validateSecret('JWT_SECRET', env.JWT_SECRET);
  const sessionSecret = validateSecret('SESSION_SECRET', env.SESSION_SECRET);
  if (jwtSecret === sessionSecret) {
    throw new Error('JWT_SECRET and SESSION_SECRET must be different');
  }
  return {
    jwtSecret,
    sessionSecret,
  };
}


function parseRequiredPort(
  name,
  env = process.env,
) {
  const raw =
    requiredValue(
      name,
      env,
    );

  const value =
    Number(raw);

  if (
    !Number.isSafeInteger(value)
    || value < 1
    || value > 65535
  ) {
    throw new Error(
      `${name} must be a valid TCP port`,
    );
  }

  return value;
}

function parseRequiredBoolean(
  name,
  env = process.env,
) {
  const raw =
    requiredValue(
      name,
      env,
    ).toLowerCase();

  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  throw new Error(
    `${name} must be true or false`,
  );
}

function loadPasswordRecoverySecurityConfig(
  env = process.env,
) {
  const recoverySecret =
    validateSecret(
      'PASSWORD_RECOVERY_SECRET',
      env.PASSWORD_RECOVERY_SECRET,
    );

  const jwtSecret =
    env.JWT_SECRET?.trim();

  const sessionSecret =
    env.SESSION_SECRET?.trim();

  if (
    recoverySecret === jwtSecret
    || recoverySecret === sessionSecret
  ) {
    throw new Error(
      'PASSWORD_RECOVERY_SECRET must be distinct from authentication secrets',
    );
  }

  return {
    recoverySecret,
  };
}

function loadPasswordRecoveryMailConfig(
  env = process.env,
) {
  const smtpHost =
    requiredValue(
      'SMTP_HOST',
      env,
    );

  const smtpPort =
    parseRequiredPort(
      'SMTP_PORT',
      env,
    );

  const smtpSecure =
    parseRequiredBoolean(
      'SMTP_SECURE',
      env,
    );

  const smtpFrom =
    requiredValue(
      'SMTP_FROM',
      env,
    );

  const smtpUser =
    env.SMTP_USER?.trim()
    || '';

  const rawPass =
    typeof env.SMTP_PASS === 'string'
      ? env.SMTP_PASS
      : '';

  const hasPass =
    rawPass.trim().length > 0;

  if (
    Boolean(smtpUser)
    !== hasPass
  ) {
    throw new Error(
      'SMTP_USER and SMTP_PASS must either both be supplied or both be omitted',
    );
  }

  return {
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpFrom,
    smtpUser,
    smtpPass:
      hasPass
        ? rawPass
        : '',
  };
}

function loadAppConfig(env = process.env) {
  const security = loadSecurityConfig(env);
  return {
    ...security,
    mongodbUri: requiredValue('MONGODB_URI', env),
    allowedOrigins: parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS || ''),
  };
}

module.exports = {
  MIN_SECRET_LENGTH,
  requiredValue,
  validateSecret,
  loadSecurityConfig,
  loadPasswordRecoverySecurityConfig,
  loadPasswordRecoveryMailConfig,
  loadAppConfig,
};