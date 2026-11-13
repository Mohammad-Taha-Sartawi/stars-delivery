const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  canonicalGovernorate,
  governorateKey,
  isValidAreaForGovernorate,
} = require('../src/services/registrationLocation');
const {
  CITIES_BY_GOVERNORATE,
} = require('../src/services/palestineCities');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('profile area validation matches the bundled city catalog', () => {
  assert.equal(canonicalGovernorate('رام الله'), 'رام الله والبيرة');
  assert.equal(governorateKey({ area: 'Al-Dawha' }), 'بيت لحم');
  assert.equal(governorateKey({ area: 'بيت لحم' }), 'بيت لحم');
  assert.equal(CITIES_BY_GOVERNORATE['بيت لحم'].includes('Beit Jala'), true);
  assert.equal(
    CITIES_BY_GOVERNORATE['رام الله والبيرة'].includes('Al-Bireh'),
    true,
  );

  assert.equal(isValidAreaForGovernorate('بيت لحم', 'Beit Jala'), true);
  assert.equal(isValidAreaForGovernorate('بيت لحم', 'بيت لحم'), true);
  assert.equal(isValidAreaForGovernorate('بيت لحم', 'الخليل'), false);
  assert.equal(isValidAreaForGovernorate('رام الله', 'Al-Bireh'), true);
  assert.equal(isValidAreaForGovernorate('رام الله', 'Gaza City'), false);
  assert.equal(isValidAreaForGovernorate('', 'Beit Jala'), false);
});

test('profile location update stores governorate and area together', () => {
  const users = source('src/routes/users.js');
  const start = users.indexOf("router.put('/area'");
  const end = users.indexOf('router.', start + 1);
  const route = users.slice(start, end);

  assert.ok(start !== -1);
  assert.match(route, /isValidAreaForGovernorate/);
  assert.match(route, /INVALID_AREA/);
  assert.match(route, /user\.governorate\s*=/);
  assert.match(route, /user\.area\s*=/);
  assert.doesNotMatch(route, /governorateLevel\s*=/);
  assert.match(route, /publicMobileUser\(user\)/);
});

test('profile UI exposes governorate and city selection', () => {
  const profile = source('../lib/screens/profile_screen.dart');
  const login = source('../lib/screens/login_screen.dart');
  const catalog = source('../lib/services/location_catalog.dart');

  assert.match(profile, /LocationCatalog\.load/);
  assert.match(profile, /LocationCatalog\.findForUser/);
  assert.match(profile, /profileGovernorateDropdown/);
  assert.match(profile, /profileSaveLocation/);
  assert.match(profile, /\/users\/area/);
  assert.match(profile, /onUserUpdated/);

  // Registration and profile share the same canonical catalog.
  assert.match(login, /LocationCatalog\.load/);
  assert.match(catalog, /legacyAreaValues/);
  assert.match(catalog, /areaValue/);
});
