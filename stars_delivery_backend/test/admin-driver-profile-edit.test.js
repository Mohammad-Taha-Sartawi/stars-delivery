const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('admin can update every driver profile field', () => {
  const route = source('src/routes/adminDrivers.js');

  assert.match(route, /router\.put\('\/:id\/profile'/);
  assert.match(route, /fullName/);
  assert.match(route, /normalizeMobileEmail/);
  assert.match(route, /phoneNumbers:\s*\[\{\s*number:\s*phone,\s*primary:\s*true\s*\}\]/s);
  assert.match(route, /isValidAreaForGovernorate/);
  assert.match(route, /normalizeServiceTypes/);
  assert.match(route, /licenseNotAvailable/);
  assert.match(route, /governorateLevel/);
  assert.match(route, /serviceTypes/);
  assert.match(route, /sessionVersion:\s*1/);
});

test('admin profile updates synchronize socket rooms and notify the app', () => {
  const route = source('src/routes/adminDrivers.js');

  assert.match(route, /fetchSockets\(\)/);
  assert.match(route, /socket\.leave\(room\)/);
  assert.match(route, /socket\.join\(`area:/);
  assert.match(route, /socket\.join\(`governorate:/);
  assert.match(route, /provider_profile_updated/);
  assert.match(route, /publicMobileUser\(updated\)/);
});

test('driver edit modal exposes editable fields and save flow', () => {
  const modal = source('src/views/admin/partials/modals.ejs');
  const script = source('src/public/js/main.js');

  assert.match(modal, /id="driverEditModal"/);
  assert.match(modal, /id="driverEditName"/);
  assert.match(modal, /id="driverEditEmail"/);
  assert.match(modal, /id="driverEditPhone"/);
  assert.match(modal, /id="driverEditGovernorate"/);
  assert.match(modal, /id="driverEditArea"/);
  assert.match(modal, /id="driverEditServiceProduct"/);
  assert.match(modal, /id="driverEditStatus"/);
  assert.match(script, /openEditDriver/);
  assert.match(script, /saveDriverEdits/);
  assert.match(script, /\/profile/);
  assert.match(script, /driverEditForm/);
});
