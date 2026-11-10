function adminSessionVersion(value) {
  if (value === undefined || value === null) {
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

function isActiveAdminAccount(admin) {
  return Boolean(
    admin
    && admin.role === 'admin'
    && admin.status === 'active'
    && admin.deleted !== true,
  );
}

function adminSessionVersionMatches(
  admin,
  sessionVersion,
) {
  const persisted = adminSessionVersion(
    admin?.sessionVersion,
  );
  const supplied = adminSessionVersion(
    sessionVersion,
  );

  return persisted !== null
    && supplied !== null
    && persisted === supplied;
}

module.exports = {
  adminSessionVersion,
  isActiveAdminAccount,
  adminSessionVersionMatches,
};
