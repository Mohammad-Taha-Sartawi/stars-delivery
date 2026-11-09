const {
  isMobileRole,
} = require('../middleware/mobileRole');

function isActiveMobileAccount(
  user,
  expectedRole,
) {
  if (!user || !isMobileRole(user.role)) {
    return false;
  }

  if (
    expectedRole
    && user.role !== expectedRole
  ) {
    return false;
  }

  return user.deleted !== true
    && user.status === 'active';
}

function publicMobileUser(user) {
  const phones =
    Array.isArray(user.phoneNumbers)
      ? user.phoneNumbers
      : [];

  const primaryPhone =
    phones.find(
      phone => phone?.primary,
    )?.number
    || phones[0]?.number
    || '';

  return {
    id:
      user._id?.toString?.()
      || user.id?.toString?.()
      || '',
    fullName: user.fullName || '',
    email: user.email || '',
    phone: primaryPhone,
    role: user.role || '',
    area: user.area || '',
    governorate: user.governorate || '',
    publicId: user.publicId || '',
  };
}

function mobileSessionVersion(
  userOrVersion,
) {
  const value =
    userOrVersion
    && typeof userOrVersion === 'object'
      ? userOrVersion.sessionVersion
      : userOrVersion;

  // Existing database documents created before STARS-016
  // do not physically contain this property.
  if (value === undefined) {
    return 0;
  }

  if (
    !Number.isSafeInteger(value)
    || value < 0
  ) {
    return null;
  }

  return value;
}

function tokenMobileSessionVersion(
  value,
) {
  // Existing JWTs issued before STARS-016 carry no claim.
  if (value === undefined) {
    return 0;
  }

  if (
    !Number.isSafeInteger(value)
    || value < 0
  ) {
    return null;
  }

  return value;
}

function mobileSessionVersionMatches(
  user,
  tokenVersion,
) {
  const persisted =
    mobileSessionVersion(user);

  const supplied =
    tokenMobileSessionVersion(
      tokenVersion,
    );

  return persisted !== null
    && supplied !== null
    && persisted === supplied;
}

function mobileSessionRotationFilter(
  user,
) {
  const current =
    mobileSessionVersion(user);

  if (
    current === null
    || current >= Number.MAX_SAFE_INTEGER
  ) {
    return null;
  }

  if (current === 0) {
    return {
      $or: [
        {
          sessionVersion: 0,
        },
        {
          sessionVersion: {
            $exists: false,
          },
        },
      ],
    };
  }

  return {
    sessionVersion: current,
  };
}

module.exports = {
  isActiveMobileAccount,
  publicMobileUser,
  mobileSessionVersion,
  tokenMobileSessionVersion,
  mobileSessionVersionMatches,
  mobileSessionRotationFilter,
};
