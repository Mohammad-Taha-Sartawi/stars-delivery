const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW_STEPS = 1;

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input) {
  const normalized = String(input || '')
    .toUpperCase()
    .replace(/[\s=-]+/g, '');

  let bits = 0;
  let value = 0;
  const output = [];

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);

    if (index === -1) {
      throw new Error('Invalid base32 secret');
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function generateTotpSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

function hotp(secret, counter) {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = crypto
    .createHmac('sha1', key)
    .update(counterBuffer)
    .digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);

  return String(binary % (10 ** TOTP_DIGITS))
    .padStart(TOTP_DIGITS, '0');
}

function generateTotpCode(secret, now = Date.now()) {
  return hotp(
    secret,
    Math.floor(now / (TOTP_PERIOD_SECONDS * 1000)),
  );
}

function timingSafeCodeEqual(expected, supplied) {
  const expectedBuffer = Buffer.from(String(expected));
  const suppliedBuffer = Buffer.from(String(supplied));

  return expectedBuffer.length === suppliedBuffer.length
    && crypto.timingSafeEqual(
      expectedBuffer,
      suppliedBuffer,
    );
}

function verifyTotpCode(
  secret,
  suppliedCode,
  {
    now = Date.now(),
    window = TOTP_WINDOW_STEPS,
  } = {},
) {
  const code = String(suppliedCode || '')
    .replace(/\s+/g, '');

  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(code)) {
    return false;
  }

  let secretValue;

  try {
    secretValue = base32Decode(secret);
  } catch (_error) {
    return false;
  }

  if (secretValue.length < 10) {
    return false;
  }

  const counter = Math.floor(
    now / (TOTP_PERIOD_SECONDS * 1000),
  );

  for (
    let offset = -window;
    offset <= window;
    offset += 1
  ) {
    const expected = hotp(secret, counter + offset);

    if (timingSafeCodeEqual(expected, code)) {
      return true;
    }
  }

  return false;
}

function buildTotpUri({
  secret,
  email,
  issuer = 'Stars Delivery',
}) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(String(email || 'admin'))}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = crypto
      .randomBytes(5)
      .toString('hex')
      .toUpperCase();

    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}

function hashRecoveryCode(code) {
  const key =
    process.env.JWT_SECRET
    || 'stars-delivery-recovery-code-hash';

  return crypto
    .createHmac('sha256', key)
    .update(
      String(code || '')
        .replace(/[\s-]+/g, '')
        .toUpperCase(),
    )
    .digest('hex');
}

module.exports = {
  BASE32_ALPHABET,
  TOTP_PERIOD_SECONDS,
  TOTP_DIGITS,
  TOTP_WINDOW_STEPS,
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  buildTotpUri,
  generateRecoveryCodes,
  hashRecoveryCode,
};
