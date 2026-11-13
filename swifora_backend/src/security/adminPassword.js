const bcrypt = require('bcryptjs');

/**
 * Checks an administrator password against its bcrypt hash.
 *
 * The dashboard's change-password form trims spaces around the new password,
 * and phone keyboards often add a trailing space (for example after ".com"),
 * so a password typed with surrounding spaces is also tried without them.
 */
async function adminPasswordMatches(plain, hash) {
  const password = typeof plain === 'string' ? plain : '';
  if (await bcrypt.compare(password, hash)) return true;
  const trimmed = password.trim();
  return trimmed !== password && trimmed.length > 0
    ? bcrypt.compare(trimmed, hash)
    : false;
}

module.exports = { adminPasswordMatches };
