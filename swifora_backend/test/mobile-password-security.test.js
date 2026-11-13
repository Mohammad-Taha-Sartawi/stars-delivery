const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MIN_MOBILE_PASSWORD_LENGTH,
  MAX_MOBILE_PASSWORD_LENGTH,
  isValidMobilePassword,
} = require('../src/security/passwordPolicy');

const backendRoot =
  path.resolve(__dirname, '..');

function source(relativePath) {
  return fs.readFileSync(
    path.join(
      backendRoot,
      relativePath,
    ),
    'utf8',
  );
}

test(
  'mobile password policy enforces safe creation and change credentials',
  () => {
    assert.equal(
      MIN_MOBILE_PASSWORD_LENGTH,
      12,
    );

    assert.equal(
      MAX_MOBILE_PASSWORD_LENGTH,
      128,
    );

    assert.equal(
      isValidMobilePassword(
        '12345678901',
      ),
      false,
    );

    assert.equal(
      isValidMobilePassword(
        'Secure Mobile Password 2026!',
      ),
      true,
    );

    assert.equal(
      isValidMobilePassword(
        'placeholder-password',
      ),
      false,
    );

    assert.equal(
      isValidMobilePassword(
        'x'.repeat(129),
      ),
      false,
    );
  },
);

test(
  'mobile registration validates password before hashing',
  () => {
    const authSource =
      source(
        'src/routes/auth.js',
      );

    const registrationStart =
      authSource.indexOf(
        "router.post('/register'",
      );

    const loginStart =
      authSource.indexOf(
        "router.post('/login'",
      );

    assert.ok(
      registrationStart >= 0,
    );

    assert.ok(
      loginStart > registrationStart,
    );

    const registrationSource =
      authSource.slice(
        registrationStart,
        loginStart,
      );

    const policyIndex =
      registrationSource.indexOf(
        'isValidMobilePassword(password)',
      );

    const hashIndex =
      registrationSource.indexOf(
        'bcrypt.hash(password, 10)',
      );

    assert.ok(
      policyIndex >= 0,
    );

    assert.ok(
      hashIndex > policyIndex,
    );

    assert.match(
      registrationSource,
      /code:\s*'PASSWORD_POLICY'/,
    );
  },
);

test(
  'login remains compatible with existing shorter legacy credentials',
  () => {
    const authSource =
      source(
        'src/routes/auth.js',
      );

    const loginStart =
      authSource.indexOf(
        "router.post('/login'",
      );

    assert.ok(
      loginStart >= 0,
    );

    const loginSource =
      authSource.slice(
        loginStart,
      );

    assert.match(
      loginSource,
      /bcrypt\.compare\(\s*suppliedPassword,\s*user\?\.password\s*\|\|\s*DUMMY_PASSWORD_HASH,?\s*\)/,
    );

    assert.doesNotMatch(
      loginSource,
      /isValidMobilePassword\(password\)/,
    );
  },
);

test(
  'self-service password change reauthenticates current credential',
  () => {
    const usersSource =
      source(
        'src/routes/users.js',
      );

    const passwordStart =
      usersSource.indexOf(
        "router.put('/password'",
      );

    const profileStart =
      usersSource.indexOf(
        "router.put('/profile'",
      );

    assert.ok(
      passwordStart >= 0,
    );

    assert.ok(
      profileStart > passwordStart,
    );

    const passwordSource =
      usersSource.slice(
        passwordStart,
        profileStart,
      );

    assert.match(
      passwordSource,
      /\.select\('\+password'\)/,
    );

    assert.match(
      passwordSource,
      /bcrypt\.compare\(\s*currentPassword,\s*user\.password/,
    );

    assert.match(
      passwordSource,
      /isValidMobilePassword\(newPassword\)/,
    );

    assert.match(
      passwordSource,
      /newPassword !== confirmPassword/,
    );

    assert.match(
      passwordSource,
      /bcrypt\.hash\(\s*newPassword,\s*10/,
    );

    assert.match(
      passwordSource,
      /CURRENT_PASSWORD_INVALID/,
    );
  },
);

test(
  'generic profile update rejects credential mutation',
  () => {
    const usersSource =
      source(
        'src/routes/users.js',
      );

    const profileStart =
      usersSource.indexOf(
        "router.put('/profile'",
      );

    const frequentItemsStart =
      usersSource.indexOf(
        "router.get('/frequent-items'",
        profileStart,
      );

    assert.ok(
      profileStart >= 0,
    );

    assert.ok(
      frequentItemsStart > profileStart,
    );

    const profileSource =
      usersSource.slice(
        profileStart,
        frequentItemsStart,
      );

    assert.match(
      profileSource,
      /PASSWORD_ENDPOINT_REQUIRED/,
    );

    assert.doesNotMatch(
      profileSource,
      /update\.password/,
    );

    assert.doesNotMatch(
      profileSource,
      /bcrypt\.hash/,
    );
  },
);
