const crypto = require('crypto');
const User = require('../models/User');

const MAX_PUBLIC_ID_LENGTH = 12;
const GENERATED_MIN_LENGTH = 10;

function publicIdDigits(value) {
  return typeof value === 'string' ? value : '';
}

function hasRepeatedDigitMoreThanTwice(value) {
  const counts = new Map();

  for (const digit of value) {
    const next = (counts.get(digit) || 0) + 1;
    if (next > 2) return true;
    counts.set(digit, next);
  }

  return false;
}

function isSequentialPattern(value) {
  if (value.length < 2) return false;

  let ascending = true;
  let descending = true;

  for (let index = 1; index < value.length; index += 1) {
    const previous = Number(value[index - 1]);
    const current = Number(value[index]);

    if (current !== previous + 1) ascending = false;
    if (current !== previous - 1) descending = false;
  }

  return ascending || descending;
}

function isRepeatedBlockPattern(value) {
  for (let size = 2; size <= value.length / 2; size += 1) {
    if (value.length % size !== 0) continue;

    const block = value.slice(0, size);
    if (block.repeat(value.length / size) === value) {
      return true;
    }
  }

  return false;
}

function isSpecialPublicId(value) {
  const id = publicIdDigits(value);
  if (id.length < 2) return true;
  if (id.split('').every((digit) => digit === id[0])) return true;
  if (hasRepeatedDigitMoreThanTwice(id)) return true;
  if (isSequentialPattern(id)) return true;
  if (isRepeatedBlockPattern(id)) return true;
  return false;
}

function isValidPublicId(value) {
  const id = publicIdDigits(value).trim();

  if (!/^[1-9]\d{0,11}$/.test(id)) return false;
  return !isSpecialPublicId(id);
}

function isValidAdminPublicId(value) {
  const id = String(value ?? '').trim();
  return /^\d{1,50}$/.test(id);
}

function randomPublicId() {
  const length =
    GENERATED_MIN_LENGTH
    + crypto.randomInt(0, MAX_PUBLIC_ID_LENGTH - GENERATED_MIN_LENGTH + 1);

  let id = String(crypto.randomInt(1, 10));

  for (let index = 1; index < length; index += 1) {
    id += String(crypto.randomInt(0, 10));
  }

  return id;
}

async function generatePublicId() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const id = randomPublicId();
    if (!isValidPublicId(id)) continue;

    const exists = await User.exists({ publicId: id });
    if (!exists) return id;
  }

  throw new Error('Failed to generate unique public ID');
}

module.exports = {
  MAX_PUBLIC_ID_LENGTH,
  GENERATED_MIN_LENGTH,
  isSpecialPublicId,
  isValidPublicId,
  isValidAdminPublicId,
  randomPublicId,
  generatePublicId,
};
