const crypto = require('crypto');

const PASSWORD_RECOVERY_CODE_LENGTH = 8;

const PASSWORD_RECOVERY_CODE_SPACE =
  10 ** PASSWORD_RECOVERY_CODE_LENGTH;

const PASSWORD_RECOVERY_TTL_MS =
  10 * 60 * 1000;

const PASSWORD_RECOVERY_ATTEMPT_LIMIT = 5;

const PASSWORD_RECOVERY_MIN_RESPONSE_MS = 300;

const PASSWORD_RECOVERY_CODE_PATTERN =
  /^\d{8}$/;

const GENERIC_PASSWORD_RECOVERY_REQUEST_RESPONSE =
  Object.freeze({
    message:
      'If an eligible account exists for this email, a recovery code will be sent.',
  });

const INVALID_PASSWORD_RECOVERY_RESPONSE =
  Object.freeze({
    error:
      'Invalid or expired password recovery code.',
    code: 'PASSWORD_RECOVERY_INVALID',
  });

const PASSWORD_RECOVERY_UNAVAILABLE_RESPONSE =
  Object.freeze({
    error:
      'Password recovery is temporarily unavailable.',
    code: 'PASSWORD_RECOVERY_UNAVAILABLE',
  });

function generatePasswordRecoveryCode(
  randomInt = crypto.randomInt,
) {
  const value =
    randomInt(
      0,
      PASSWORD_RECOVERY_CODE_SPACE,
    );

  return value
    .toString()
    .padStart(
      PASSWORD_RECOVERY_CODE_LENGTH,
      '0',
    );
}

function generatePasswordRecoveryNonce(
  randomBytes = crypto.randomBytes,
) {
  return randomBytes(32)
    .toString('hex');
}

function isPasswordRecoveryCode(value) {
  return (
    typeof value === 'string'
    && PASSWORD_RECOVERY_CODE_PATTERN
      .test(value)
  );
}

function createPasswordRecoveryCodeDigest({
  secret,
  userId,
  email,
  sessionVersion,
  nonce,
  code,
}) {
  return crypto
    .createHmac(
      'sha256',
      secret,
    )
    .update(
      [
        'stars-password-recovery',
        'v1',
        String(userId),
        String(email),
        String(sessionVersion),
        String(nonce),
        String(code),
      ].join(':'),
    )
    .digest('hex');
}

function verifyPasswordRecoveryCodeDigest({
  expectedDigest,
  secret,
  userId,
  email,
  sessionVersion,
  nonce,
  code,
}) {
  if (
    typeof expectedDigest !== 'string'
    || !/^[a-f0-9]{64}$/.test(
      expectedDigest,
    )
    || !isPasswordRecoveryCode(code)
  ) {
    return false;
  }

  const supplied =
    createPasswordRecoveryCodeDigest({
      secret,
      userId,
      email,
      sessionVersion,
      nonce,
      code,
    });

  const expectedBuffer =
    Buffer.from(
      expectedDigest,
      'hex',
    );

  const suppliedBuffer =
    Buffer.from(
      supplied,
      'hex',
    );

  return (
    expectedBuffer.length
      === suppliedBuffer.length
    && crypto.timingSafeEqual(
      expectedBuffer,
      suppliedBuffer,
    )
  );
}

async function waitForMinimumRecoveryResponse(
  startedAt,
) {
  const elapsed =
    Date.now() - startedAt;

  const remaining =
    PASSWORD_RECOVERY_MIN_RESPONSE_MS
    - elapsed;

  if (remaining <= 0) {
    return;
  }

  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        remaining,
      ),
  );
}

module.exports = {
  PASSWORD_RECOVERY_CODE_LENGTH,
  PASSWORD_RECOVERY_TTL_MS,
  PASSWORD_RECOVERY_ATTEMPT_LIMIT,
  PASSWORD_RECOVERY_MIN_RESPONSE_MS,
  GENERIC_PASSWORD_RECOVERY_REQUEST_RESPONSE,
  INVALID_PASSWORD_RECOVERY_RESPONSE,
  PASSWORD_RECOVERY_UNAVAILABLE_RESPONSE,
  generatePasswordRecoveryCode,
  generatePasswordRecoveryNonce,
  isPasswordRecoveryCode,
  createPasswordRecoveryCodeDigest,
  verifyPasswordRecoveryCodeDigest,
  waitForMinimumRecoveryResponse,
};
