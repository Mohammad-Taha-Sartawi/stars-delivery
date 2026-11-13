const {
  test,
} = require('node:test');

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const {
  MOBILE_EMAIL_MAX_LENGTH,
  normalizeMobileEmail,
  isValidMobileEmail,
} =
  require('../src/security/mobileEmail');

const root =
  path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8',
  );
}

const userModel =
  read('src/models/User.js');

const pendingModel =
  read('src/models/PendingProvider.js');

const authRoute =
  read('src/routes/auth.js');

const usersRoute =
  read('src/routes/users.js');

test(
  'mobile email identity normalizes case and whitespace with bounded validation',
  () => {
    assert.equal(
      MOBILE_EMAIL_MAX_LENGTH,
      254,
    );

    assert.equal(
      normalizeMobileEmail(
        '  Example.User@Example.COM  ',
      ),
      'example.user@example.com',
    );

    assert.equal(
      isValidMobileEmail(
        'user@example.com',
      ),
      true,
    );

    assert.equal(
      isValidMobileEmail(
        'not-an-email',
      ),
      false,
    );

    assert.equal(
      isValidMobileEmail(
        `${'a'.repeat(250)}@example.com`,
      ),
      false,
    );
  },
);

test(
  'active and pending account schemas trim and lowercase unique email identities',
  () => {
    const expected =
      'email: { type: String, required: true, unique: true, lowercase: true, trim: true }';

    assert.ok(
      userModel.includes(expected),
    );

    assert.ok(
      pendingModel.includes(expected),
    );
  },
);

test(
  'registration and login use normalized validated mobile email identities',
  () => {
    assert.ok(
      authRoute.includes(
        'const normalizedEmail =',
      ),
    );

    assert.ok(
      authRoute.includes(
        'normalizeMobileEmail(email)',
      ),
    );

    assert.ok(
      authRoute.includes(
        '!isValidMobileEmail(normalizedEmail)',
      ),
    );

    assert.ok(
      authRoute.includes(
        'isReservedGuestEmail(normalizedEmail)',
      ),
    );

    assert.ok(
      authRoute.includes(
        'User.findOne({ email: normalizedEmail })',
      ),
    );

    assert.ok(
      authRoute.includes(
        'PendingProvider.findOne({ email: normalizedEmail })',
      ),
    );
  },
);

test(
  'generic profile update refuses recovery-email mutation',
  () => {
    const profileStart =
      usersRoute.indexOf(
        "// Profile update intentionally excludes credential changes.",
      );

    const profileEnd =
      usersRoute.indexOf(
        '// Frequent items',
        profileStart,
      );

    const profileBlock =
      usersRoute.slice(
        profileStart,
        profileEnd,
      );

    assert.ok(
      profileBlock.includes(
        'EMAIL_ENDPOINT_REQUIRED',
      ),
    );

    assert.equal(
      profileBlock.includes(
        'update.email',
      ),
      false,
    );
  },
);

test(
  'dedicated email change requires current credential before identity availability lookup',
  () => {
    const start =
      usersRoute.indexOf(
        "router.put('/email'",
      );

    const end =
      usersRoute.indexOf(
        "// Profile update intentionally excludes credential changes.",
        start,
      );

    const block =
      usersRoute.slice(start, end);

    assert.ok(
      block.includes(
        'EMAIL_FIELDS_REQUIRED',
      ),
    );

    assert.ok(
      block.includes(
        'EMAIL_CONFIRMATION_MISMATCH',
      ),
    );

    assert.ok(
      block.includes(
        'bcrypt.compare',
      ),
    );

    assert.ok(
      block.indexOf(
        'bcrypt.compare',
      )
      < block.indexOf(
        'User.exists',
      ),
    );

    assert.ok(
      block.indexOf(
        'bcrypt.compare',
      )
      < block.indexOf(
        'PendingProvider.exists',
      ),
    );
  },
);

test(
  'dedicated email change rejects invalid reserved and already-used identities',
  () => {
    const start =
      usersRoute.indexOf(
        "router.put('/email'",
      );

    const end =
      usersRoute.indexOf(
        "// Profile update intentionally excludes credential changes.",
        start,
      );

    const block =
      usersRoute.slice(start, end);

    assert.ok(
      block.includes(
        'isValidMobileEmail(newEmail)',
      ),
    );

    assert.ok(
      block.includes(
        'isReservedGuestEmail(newEmail)',
      ),
    );

    assert.ok(
      block.includes(
        'EMAIL_INVALID',
      ),
    );

    assert.ok(
      block.includes(
        'EMAIL_IN_USE',
      ),
    );

    assert.ok(
      block.includes(
        'err?.code === 11000',
      ),
    );
  },
);

test(
  'email identity rotation clears verification and revokes mobile sessions atomically',
  () => {
    const start =
      usersRoute.indexOf(
        "router.put('/email'",
      );

    const end =
      usersRoute.indexOf(
        "// Profile update intentionally excludes credential changes.",
        start,
      );

    const block =
      usersRoute.slice(start, end);

    assert.ok(
      block.includes(
        'mobileSessionRotationFilter(user)',
      ),
    );

    assert.ok(
      block.includes(
        'verified: false',
      ),
    );

    assert.ok(
      block.includes(
        'sessionVersion: 1',
      ),
    );

    assert.ok(
      block.includes(
        '.disconnectSockets(true)',
      ),
    );

    assert.ok(
      block.includes(
        'rotation.matchedCount !== 1',
      ),
    );
  },
);

test(
  'email rotation issues no replacement credential or password disclosure',
  () => {
    const start =
      usersRoute.indexOf(
        "router.put('/email'",
      );

    const end =
      usersRoute.indexOf(
        "// Profile update intentionally excludes credential changes.",
        start,
      );

    const block =
      usersRoute.slice(start, end);

    assert.equal(
      block.includes(
        'jwt.sign',
      ),
      false,
    );

    assert.equal(
      /token\s*:/.test(block),
      false,
    );

    assert.equal(
      /password\s*:\s*(?:user|hashed|current|new)/.test(block),
      false,
    );
  },
);
