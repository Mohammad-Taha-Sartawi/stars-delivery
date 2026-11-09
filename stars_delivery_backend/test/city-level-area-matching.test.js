const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('registration area is matched exactly at village/city level', () => {
  const auth = source('src/routes/auth.js');
  const orders = source('src/routes/orders.js');
  const provider = source('src/routes/provider.js');

  // Registration persists the selected village/city in `area` and the
  // selected governorate in `governorate`.
  assert.match(
    auth,
    /area,\s*\n\s*governorate,/,
  );
  assert.match(auth, /area:\s*registrationArea/);
  assert.match(auth, /governorate:\s*registrationGovernorate/);

  // Orders take the customer's registered area (not GPS) and providers only
  // see orders from the same exact area value.
  assert.match(orders, /const orderArea = user\.area \|\| area \|\| ''/);
  assert.match(orders, /order\.area === req\.authUser\.area/);
  assert.match(
    provider,
    /const qArea = user\.area \|\| req\.query\.area \|\| ''/,
  );
  assert.match(provider, /areaFilter\.area = qArea/);
});

test('a location sync never overwrites the registered village/city', () => {
  const users = source('src/routes/users.js');

  assert.match(users, /router\.put\('\/location'/);
  assert.match(
    users,
    /const registeredArea =\s*\n\s*typeof user\.area === 'string' \? user\.area\.trim\(\) : ''/,
  );
  assert.match(users, /if \(!registeredArea && typeof area === 'string'\)/);
  assert.match(users, /await user\.save\(\)/);
  assert.doesNotMatch(users, /findByIdAndUpdate\(req\.userId, update/);
});
