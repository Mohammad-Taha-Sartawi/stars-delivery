const LEGACY_ADMIN_PASSWORD = 'admin123';

const INSECURE_PASSWORDS = new Set([
  LEGACY_ADMIN_PASSWORD,
  'do-not-store-a-real-password-here',
  'changeme',
  'change-me',
  'change me',
]);

const OBVIOUS_PLACEHOLDER_PATTERN =
  /^(change|replace|your|example|placeholder|dummy)[-_ ]/;

const MIN_ADMIN_PASSWORD_LENGTH = 12;

function normalizePassword(password) {
  return typeof password === 'string'
    ? password.trim().toLowerCase()
    : '';
}

function isObviousPlaceholderPassword(password) {
  const normalized = normalizePassword(password);

  return INSECURE_PASSWORDS.has(normalized)
    || OBVIOUS_PLACEHOLDER_PATTERN.test(normalized);
}

function isValidAdminPassword(password) {
  return typeof password === 'string'
    && password.length >= MIN_ADMIN_PASSWORD_LENGTH
    && !isObviousPlaceholderPassword(password);
}

const MIN_MOBILE_PASSWORD_LENGTH = 12;
const MAX_MOBILE_PASSWORD_LENGTH = 128;

function isValidMobilePassword(password) {
  return typeof password === 'string'
    && password.trim().length >= MIN_MOBILE_PASSWORD_LENGTH
    && password.length <= MAX_MOBILE_PASSWORD_LENGTH
    && !isObviousPlaceholderPassword(password);
}

const MIN_PROVIDER_BOOTSTRAP_PASSWORD_LENGTH =
  MIN_MOBILE_PASSWORD_LENGTH;

const MAX_PROVIDER_BOOTSTRAP_PASSWORD_LENGTH =
  MAX_MOBILE_PASSWORD_LENGTH;

function isValidProviderBootstrapPassword(password) {
  return isValidMobilePassword(password);
}

module.exports = {
  MIN_ADMIN_PASSWORD_LENGTH,
  MIN_MOBILE_PASSWORD_LENGTH,
  MAX_MOBILE_PASSWORD_LENGTH,
  MIN_PROVIDER_BOOTSTRAP_PASSWORD_LENGTH,
  MAX_PROVIDER_BOOTSTRAP_PASSWORD_LENGTH,
  isValidAdminPassword,
  isValidMobilePassword,
  isValidProviderBootstrapPassword,
};
