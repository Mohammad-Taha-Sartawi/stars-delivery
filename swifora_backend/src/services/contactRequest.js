const CONTACT_PREFIX = 'contact:';

const LIMITS = Object.freeze({
  name: 100,
  email: 254,
  phone: 32,
  text: 2000,
});

class ContactValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ContactValidationError';
    this.code = code;
    this.status = 400;
  }
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function assertLength(field, value, maximum) {
  if (value.length > maximum) {
    throw new ContactValidationError(
      'CONTACT_FIELD_TOO_LONG',
      `${field} exceeds the maximum allowed length.`,
    );
  }
}

function isReservedGuestEmail(value) {
  const email = normalizeString(value).toLowerCase();
  return email.endsWith('@guest.local');
}

function normalizeContactPayload(payload = {}) {
  const name = normalizeString(payload.name) || 'Guest';
  const email = normalizeString(payload.email).toLowerCase();
  const phone = normalizeString(payload.phone);
  const text = normalizeString(payload.text);

  assertLength('name', name, LIMITS.name);
  assertLength('email', email, LIMITS.email);
  assertLength('phone', phone, LIMITS.phone);
  assertLength('text', text, LIMITS.text);

  if (!text) {
    throw new ContactValidationError(
      'CONTACT_MESSAGE_REQUIRED',
      'Message is required',
    );
  }

  if (!email && !phone) {
    throw new ContactValidationError(
      'CONTACT_METHOD_REQUIRED',
      'Email or phone number is required',
    );
  }

  if (
    email
    && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new ContactValidationError(
      'CONTACT_EMAIL_INVALID',
      'Email address is invalid',
    );
  }

  if (email && isReservedGuestEmail(email)) {
    throw new ContactValidationError(
      'CONTACT_EMAIL_INVALID',
      'Email address is invalid',
    );
  }

  return { name, email, phone, text };
}

function contactConversationId(id) {
  return `${CONTACT_PREFIX}${id}`;
}

function parseContactConversationId(value) {
  if (typeof value !== 'string' || !value.startsWith(CONTACT_PREFIX)) {
    return null;
  }

  const id = value.slice(CONTACT_PREFIX.length);

  return /^[a-f\d]{24}$/i.test(id) ? id : null;
}

function formatContactMessage(contact) {
  const name = normalizeString(contact?.name) || 'Guest';
  const email = normalizeString(contact?.email);
  const phone = normalizeString(contact?.phone);
  const text = normalizeString(contact?.text);

  return `[${name}] [${email}] [${phone}]\n${text}`;
}

module.exports = {
  CONTACT_PREFIX,
  LIMITS,
  ContactValidationError,
  normalizeContactPayload,
  isReservedGuestEmail,
  contactConversationId,
  parseContactConversationId,
  formatContactMessage,
};
