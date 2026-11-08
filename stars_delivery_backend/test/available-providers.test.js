const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const usersSource = fs.readFileSync(
  path.join(backendRoot, 'src/routes/users.js'),
  'utf8',
);

test(
  'customers can read the available provider count for their registered area',
  () => {
    assert.match(
      usersSource,
      /router\.get\(\s*'\/available-providers'\s*,\s*requireRole\('customer'\)/,
    );

    assert.match(usersSource, /User\.countDocuments/);

    assert.match(usersSource, /role:\s*'provider'/);

    assert.match(usersSource, /status:\s*'active'/);

    assert.match(usersSource, /deleted:\s*\{ \$ne: true \}/);

    assert.match(usersSource, /blockedUntil/);

    assert.match(usersSource, /offerCooldownUntil/);

    assert.match(usersSource, /req\.authUser\.area/);
  },
);
