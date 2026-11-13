const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MIN_MOBILE_PASSWORD_LENGTH,
  MAX_MOBILE_PASSWORD_LENGTH,
  isValidMobilePassword,
} = require('../src/security/passwordPolicy');

const projectRoot =
  path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(projectRoot, relativePath),
    'utf8',
  );
}

function region(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(
    end,
    startIndex + start.length,
  );

  assert.notEqual(
    startIndex,
    -1,
    `missing start anchor: ${start}`,
  );

  assert.notEqual(
    endIndex,
    -1,
    `missing end anchor: ${end}`,
  );

  return source.slice(
    startIndex,
    endIndex,
  );
}

const adminUsers =
  read(
    'swifora_backend/src/routes/adminUsers.js',
  );

const adminDrivers =
  read(
    'swifora_backend/src/routes/adminDrivers.js',
  );

const browser =
  read(
    'swifora_backend/src/public/js/main.js',
  );

test(
  'shared mobile password policy remains the authoritative target-reset policy',
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
        'A'.repeat(MIN_MOBILE_PASSWORD_LENGTH),
      ),
      true,
    );

    assert.equal(
      isValidMobilePassword(
        'A'.repeat(MAX_MOBILE_PASSWORD_LENGTH),
      ),
      true,
    );

    assert.equal(
      isValidMobilePassword(
        'A'.repeat(MAX_MOBILE_PASSWORD_LENGTH + 1),
      ),
      false,
    );

    assert.equal(
      isValidMobilePassword('short'),
      false,
    );

    assert.equal(
      isValidMobilePassword(
        'placeholder-password',
      ),
      false,
    );
  },
);

test(
  'customer admin reset requires confirmation and shared mobile policy before hashing',
  () => {
    const reset =
      region(
        adminUsers,
        "router.put('/:id/password'",
        "router.delete('/:id'",
      );

    assert.match(
      adminUsers,
      /isValidMobilePassword/,
    );

    assert.match(
      reset,
      /typeof req\.body\?\.password === 'string'/,
    );

    assert.match(
      reset,
      /typeof req\.body\?\.confirmPassword === 'string'/,
    );

    assert.match(
      reset,
      /code:\s*'PASSWORD_FIELDS_REQUIRED'/,
    );

    assert.match(
      reset,
      /isValidMobilePassword\(password\)/,
    );

    assert.match(
      reset,
      /code:\s*'PASSWORD_POLICY'/,
    );

    assert.match(
      reset,
      /password !== confirmPassword/,
    );

    assert.match(
      reset,
      /code:\s*'PASSWORD_CONFIRMATION_MISMATCH'/,
    );

    const policyIndex =
      reset.indexOf(
        'isValidMobilePassword(password)',
      );

    const hashIndex =
      reset.indexOf(
        'bcrypt.hash(',
      );

    assert.ok(
      policyIndex >= 0
      && hashIndex > policyIndex,
      'policy must run before bcrypt',
    );

    assert.match(
      reset,
      /bcrypt\.hash\(\s*password,\s*10/,
    );

    assert.doesNotMatch(
      reset,
      /bcrypt\.hash\(\s*req\.body\.password/,
    );
  },
);

test(
  'provider admin reset requires confirmation and shared mobile policy before hashing',
  () => {
    const reset =
      region(
        adminDrivers,
        "router.put('/:id/password'",
        "router.delete('/:id'",
      );

    assert.match(
      adminDrivers,
      /isValidMobilePassword/,
    );

    assert.match(
      reset,
      /typeof req\.body\?\.password === 'string'/,
    );

    assert.match(
      reset,
      /typeof req\.body\?\.confirmPassword === 'string'/,
    );

    assert.match(
      reset,
      /code:\s*'PASSWORD_FIELDS_REQUIRED'/,
    );

    assert.match(
      reset,
      /isValidMobilePassword\(password\)/,
    );

    assert.match(
      reset,
      /code:\s*'PASSWORD_POLICY'/,
    );

    assert.match(
      reset,
      /password !== confirmPassword/,
    );

    assert.match(
      reset,
      /code:\s*'PASSWORD_CONFIRMATION_MISMATCH'/,
    );

    const policyIndex =
      reset.indexOf(
        'isValidMobilePassword(password)',
      );

    const hashIndex =
      reset.indexOf(
        'bcrypt.hash(',
      );

    assert.ok(
      policyIndex >= 0
      && hashIndex > policyIndex,
      'policy must run before bcrypt',
    );

    assert.match(
      reset,
      /bcrypt\.hash\(\s*password,\s*10/,
    );

    assert.doesNotMatch(
      reset,
      /bcrypt\.hash\(\s*req\.body\.password/,
    );
  },
);

test(
  'admin target resets preserve atomic session revocation and socket disconnection',
  () => {
    const resets = [
      region(
        adminUsers,
        "router.put('/:id/password'",
        "router.delete('/:id'",
      ),
      region(
        adminDrivers,
        "router.put('/:id/password'",
        "router.delete('/:id'",
      ),
    ];

    for (const reset of resets) {
      assert.match(
        reset,
        /mobileSessionRotationFilter\(/,
      );

      assert.match(
        reset,
        /\$inc:\s*\{\s*sessionVersion:\s*1/,
      );

      assert.match(
        reset,
        /rotation\.matchedCount !== 1/,
      );

      assert.match(
        reset,
        /disconnectSockets\(true\)/,
      );

      assert.doesNotMatch(
        reset,
        /jwt\.sign/,
      );

      assert.doesNotMatch(
        reset,
        /res\.json\(\s*\{[^}]*\b(?:password|hashedPassword)\s*:/,
      );
    }
  },
);

test(
  'admin browser sends confirmation and honors backend success or failure for both reset paths',
  () => {
    const driver =
      region(
        browser,
        'async function changeDriverPassword',
        'async function freezeUser',
      );

    const customer =
      region(
        browser,
        'async function changeUserPassword',
        'function searchDriverById',
      );

    for (const reset of [driver, customer]) {
      assert.match(
        reset,
        /password:\s*newPassword/,
      );

      assert.match(
        reset,
        /confirmPassword/,
      );

      assert.match(
        reset,
        /const data = await res\.json\(\)/,
      );

      assert.match(
        reset,
        /if \(!data\.success\)/,
      );

      assert.match(
        reset,
        /alert\(data\.message \|\|/,
      );

      const failureIndex =
        reset.indexOf(
          'if (!data.success)',
        );

      const successRefreshIndex =
        Math.max(
          reset.indexOf(
            'searchDriverById(',
          ),
          reset.indexOf(
            'searchUserById(',
          ),
        );

      assert.ok(
        failureIndex >= 0
        && successRefreshIndex > failureIndex,
        'browser must branch on backend result before success refresh',
      );
    }
  },
);
