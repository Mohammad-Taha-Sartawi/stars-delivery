const MOBILE_EMAIL_MAX_LENGTH = 254;

const MOBILE_EMAIL_PATTERN =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function normalizeMobileEmail(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : '';
}

function isValidMobileEmail(value) {
  const email = normalizeMobileEmail(value);

  return email.length > 0
    && email.length <= MOBILE_EMAIL_MAX_LENGTH
    && MOBILE_EMAIL_PATTERN.test(email);
}

module.exports = {
  MOBILE_EMAIL_MAX_LENGTH,
  normalizeMobileEmail,
  isValidMobileEmail,
};
