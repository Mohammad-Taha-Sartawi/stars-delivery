const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const User = require('../src/models/User');
const PendingProvider = require('../src/models/PendingProvider');

const backendRoot = path.resolve(__dirname, '..');

function source(relativePath) {
  return fs.readFileSync(
    path.join(backendRoot, relativePath),
    'utf8',
  );
}

test(
  'credential hashes are excluded by default at active schema boundaries',
  () => {
    assert.equal(
      User.schema.path('password').options.select,
      false,
    );

    assert.equal(
      PendingProvider.schema.path('password').options.select,
      false,
    );
  },
);

test(
  'legitimate credential readers opt in explicitly',
  () => {
    const authSource =
      source('src/routes/auth.js');

    const usersSource =
      source('src/routes/users.js');

    const adminAuthSource =
      source('src/routes/adminAuth.js');

    const adminDriversSource =
      source('src/routes/adminDrivers.js');

    const auditSource =
      source('src/scripts/auditLegacyContactUsers.js');

    assert.match(
      authSource,
      /const user = await User\.findOne\(\{ email: normalizedEmail \}\)\.select\('\+password'\);/,
    );

    assert.equal(
      (
        usersSource.match(
          /\.select\('\+password'\)/g,
        )
        || []
      ).length,
      2,
    );

    assert.equal(
      (
        adminAuthSource.match(
          /\.select\([^)]*\+password[^)]*\)/g,
        )
        || []
      ).length,
      5,
    );

    assert.equal(
      (
        adminDriversSource.match(
          /PendingProvider\s*\.findById\(req\.params\.id\)\s*\.select\(\s*'\+password \+providerDocuments'\s*,?\s*\)/g,
        )
        || []
      ).length,
      1,
    );

    assert.doesNotMatch(
      adminDriversSource,
      /PendingProvider\s*\.findById\(req\.params\.id\)\s*\.select\(\s*'\+password'\s*\)/,
    );

    assert.match(
      auditSource,
      /\.select\('_id email role status \+password createdAt'\)/,
    );
  },
);

test(
  'admin search responses and browser result cards expose no password field',
  () => {
    const adminDriversSource =
      source('src/routes/adminDrivers.js');

    const adminUsersSource =
      source('src/routes/adminUsers.js');

    const browserSource =
      source('src/public/js/main.js');

    assert.doesNotMatch(
      adminDriversSource,
      /password:\s*'\*{4}'/,
    );

    assert.doesNotMatch(
      adminUsersSource,
      /password:\s*'\*{4}'/,
    );

    assert.doesNotMatch(
      adminDriversSource,
      /password:\s*undefined/,
    );

    assert.doesNotMatch(
      browserSource,
      /\bdriver\.password\b/,
    );

    assert.doesNotMatch(
      browserSource,
      /\buser\.password\b/,
    );
  },
);

test(
  'pending-provider listing relies on schema exclusion instead of post-fetch scrubbing',
  () => {
    const adminDriversSource =
      source('src/routes/adminDrivers.js');

    assert.match(
      adminDriversSource,
      /const pending = await PendingProvider\.find\(\)\.sort\(\{ createdAt: -1 \}\)\.lean\(\);[\s\S]*?res\.json\(pending\);/,
    );

    assert.doesNotMatch(
      adminDriversSource,
      /\{\s*\.\.\.p,\s*password:\s*undefined\s*\}/,
    );
  },
);
