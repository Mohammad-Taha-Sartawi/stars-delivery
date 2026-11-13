// Releases the identifiers of a deleted account so the same person can
// register again with the same email (and an admin can reuse a custom ID).
//
// Deleting a user from the admin dashboard keeps the document, because
// orders, offers, ratings and commission history reference it. Before this,
// the deleted document kept its unique email forever, so "permanently
// deleted" drivers and customers could never sign up again with it.
//
// The original values are kept in deletedEmail / deletedPublicId for audit.
const User = require('../models/User');
const PushToken = require('../models/PushToken');

const RELEASED_EMAIL_DOMAIN = 'deleted.invalid';

function releasedEmailFor(user, now = Date.now()) {
  return `released.${user._id}.${now}@${RELEASED_EMAIL_DOMAIN}`;
}

function isReleasedEmail(email) {
  return typeof email === 'string'
    && email.endsWith(`@${RELEASED_EMAIL_DOMAIN}`);
}

/**
 * Frees the email and publicId of a deleted account. No-op for accounts that
 * are not deleted or were already released. Returns true when it released.
 */
async function releaseDeletedAccountIdentity(user, { Model = User, Tokens = PushToken } = {}) {
  if (!user || user.deleted !== true || isReleasedEmail(user.email)) {
    return false;
  }

  const set = {
    email: releasedEmailFor(user),
    deletedEmail: user.email,
    deletedAt: user.deletedAt || new Date(),
  };
  const update = { $set: set };
  if (user.publicId) {
    set.deletedPublicId = user.publicId;
    update.$unset = { publicId: '' };
  }

  // Only release a document that is still deleted with the same email, so a
  // concurrent reactivation is never overwritten.
  const result = await Model.updateOne(
    { _id: user._id, deleted: true, email: user.email },
    update,
  );
  await Tokens.deleteMany({ userId: user._id });
  return result.modifiedCount === 1;
}

/**
 * Looks up an account by email and, if it is a deleted one, releases it.
 * Returns the account that still blocks the email (null when the email is
 * free to use).
 */
async function findActiveAccountByEmail(email, { Model = User, Tokens = PushToken } = {}) {
  const existing = await Model.findOne({ email });
  if (!existing) return null;
  if (existing.deleted === true) {
    await releaseDeletedAccountIdentity(existing, { Model, Tokens });
    return null;
  }
  return existing;
}

/**
 * Same as findActiveAccountByEmail, for an admin-assigned publicId.
 */
async function findActiveAccountByPublicId(publicId, { Model = User, Tokens = PushToken } = {}) {
  const existing = await Model.findOne({ publicId });
  if (!existing) return null;
  if (existing.deleted === true) {
    await releaseDeletedAccountIdentity(existing, { Model, Tokens });
    return null;
  }
  return existing;
}

module.exports = {
  RELEASED_EMAIL_DOMAIN,
  isReleasedEmail,
  releaseDeletedAccountIdentity,
  findActiveAccountByEmail,
  findActiveAccountByPublicId,
};
