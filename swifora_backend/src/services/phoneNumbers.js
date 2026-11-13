// Phone numbers on accounts: one shape for the app and the dashboard.
// Spaces, dashes, dots and brackets are dropped; an optional leading + is
// kept; 6 to 15 digits are accepted (local 05x numbers and +970/+972).

function normalizePhoneNumber(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  return String(value).trim().replace(/[\s\-().]/g, '');
}

function isValidPhoneNumber(value) {
  return /^\+?\d{6,15}$/.test(value);
}

/**
 * Returns a copy of [phoneNumbers] whose primary number is [phone]. Other
 * numbers on the account are kept (a duplicate of the new number is dropped).
 */
function replacePrimaryPhone(phoneNumbers, phone) {
  const others = (phoneNumbers || [])
    .filter((entry) => entry && !entry.primary && entry.number !== phone)
    .map((entry) => ({ number: entry.number, primary: false }));
  return [{ number: phone, primary: true }, ...others];
}

const INVALID_PHONE_MESSAGE =
  'رقم الهاتف غير صالح. استخدم الأرقام فقط (6 إلى 15 رقماً).';

module.exports = {
  normalizePhoneNumber,
  isValidPhoneNumber,
  replacePrimaryPhone,
  INVALID_PHONE_MESSAGE,
};
