const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('provider registration accepts an explicit no-license declaration', () => {
  const auth = source('src/routes/auth.js');
  const pendingModel = source('src/models/PendingProvider.js');
  const userModel = source('src/models/User.js');

  assert.match(auth, /licenseNotAvailable/);
  assert.match(auth, /req\.body\.licenseNotAvailable === 'true'/);
  assert.match(auth, /if \(licenseNotAvailable\)/);
  assert.match(auth, /Provider documents cannot be uploaded/);
  assert.match(auth, /licenseNotAvailable,\s*\n\s*serviceTypes/);
  assert.match(pendingModel, /licenseNotAvailable:\s*\{ type: Boolean/);
  assert.match(userModel, /licenseNotAvailable:\s*\{ type: Boolean/);
});

test('admin approval permits pending providers without a license', () => {
  const adminDrivers = source('src/routes/adminDrivers.js');

  assert.match(
    adminDrivers,
    /pending\.licenseNotAvailable !== true[\s\S]*?requiredProviderDocumentsPresent/,
  );
  assert.match(
    adminDrivers,
    /licenseNotAvailable:\s*\n\s*pending\.licenseNotAvailable === true/,
  );
  assert.match(
    adminDrivers,
    /licenseNotAvailable:\s*\n\s*pending\.licenseNotAvailable === true,[\s\S]*?complete:/,
  );
});

test('admin pending list clearly shows the no-license status', () => {
  const main = source('src/public/js/main.js');

  assert.match(main, /const licenseWaived =/);
  assert.match(main, /لا يملك رخصة/);
  assert.match(main, /const canApprove =/);
  assert.match(main, /مسجل بدون رخصة قيادة/);
  assert.match(main, /سُجّل بدون رخصة/);
});

test('mobile provider form exposes the no-license option above upload', () => {
  const login = source('../lib/screens/login_screen.dart');
  const authService = source('../lib/services/auth_service.dart');
  const authEvent = source('../lib/bloc/auth/auth_event.dart');

  assert.match(login, /providerNoLicenseOption/);
  assert.match(login, /provider_no_license_option/);
  assert.match(login, /if \(_licenseNotAvailable\)/);
  assert.match(login, /!_licenseNotAvailable/);
  assert.match(login, /licenseNotAvailable:\s*\n\s*_selectedRole == 'provider'/);

  assert.match(authService, /bool licenseNotAvailable = false/);
  assert.match(authService, /'licenseNotAvailable': licenseNotAvailable\.toString\(\)/);
  assert.match(
    authService,
    /if \(!licenseNotAvailable && driverLicenseDocument != null\)/,
  );
  assert.match(authEvent, /bool licenseNotAvailable/);
});
