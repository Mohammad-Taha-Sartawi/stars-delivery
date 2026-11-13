const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('dashboard uses the existing inactive card for unavailable drivers', () => {
  const index = source('src/views/admin/index.ejs');
  const main = source('src/public/js/main.js');

  // The standalone "available drivers" card is gone.
  assert.doesNotMatch(index, /availableDrivers/);
  assert.doesNotMatch(index, /سائقون متاحون الآن/);

  // The pre-existing inactive card remains and drives the unavailable list.
  assert.match(index, /id="inactiveDrivers"/);
  assert.match(
    index,
    /data-admin-arg-1="drivers" data-admin-arg-2="inactive"/,
  );

  // The dashboard must not look up the removed element.
  assert.doesNotMatch(main, /getElementById\('availableDrivers'\)/);

  // Clicking the inactive card loads the real driver list and filters by
  // self-set availability rather than a stub alert.
  assert.match(main, /adminFetch\('\/admin\/drivers'\)/);
  assert.match(main, /isAvailable !== false/);
  assert.doesNotMatch(main, /alert\('انقر على أيقونة/);
});

test('driver stats split active accounts by availability', () => {
  const adminApi = source('src/routes/adminApi.js');
  const adminDrivers = source('src/routes/adminDrivers.js');

  assert.match(adminApi, /isAvailable: false/);
  assert.match(adminApi, /isAvailable: \{ \$ne: false \}/);
  assert.doesNotMatch(adminApi, /availableDrivers/);
  assert.doesNotMatch(adminApi, /const inactiveDrivers = totalDrivers - activeDrivers/);

  // The list endpoint exposes the deleted flag so the modal can match the
  // dashboard count (which excludes deleted drivers).
  assert.match(adminDrivers, /deleted: driver\.deleted === true/);
});
