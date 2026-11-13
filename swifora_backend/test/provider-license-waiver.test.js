const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('provider registration completes without a license image', () => {
  const auth = source('src/routes/auth.js');
  const pendingModel = source('src/models/PendingProvider.js');
  const userModel = source('src/models/User.js');

  assert.doesNotMatch(auth, /licenseNotAvailable/);
  assert.doesNotMatch(auth, /multer|providerRegistrationUpload/);
  assert.doesNotMatch(auth, /inspectProviderDocumentFiles|persistProviderDocumentFiles/);
  assert.match(auth, /PendingProvider\.create\(\{/);
  assert.match(pendingModel, /serviceTypes/);
  assert.match(userModel, /licenseNotAvailable:\s*\{ type: Boolean/);
});

test('admin approval does not block pending providers on missing documents', () => {
  const adminDrivers = source('src/routes/adminDrivers.js');
  const approvalStart = adminDrivers.indexOf("router.post('/pending/:id/approve'");
  const approvalEnd = adminDrivers.indexOf('router.', approvalStart + 1);
  const approval = adminDrivers.slice(approvalStart, approvalEnd);

  assert.ok(approvalStart >= 0);
  assert.doesNotMatch(approval, /requiredProviderDocumentsPresent/);
  assert.doesNotMatch(approval, /documents_required/);
  assert.match(approval, /PendingProvider/);
});

test('mobile provider form no longer contains any license upload control', () => {
  const login = source('../lib/screens/login_screen.dart');
  const authService = source('../lib/services/auth_service.dart');
  const authEvent = source('../lib/bloc/auth/auth_event.dart');

  assert.doesNotMatch(login, /providerNoLicenseOption/);
  assert.doesNotMatch(login, /provider_no_license_option/);
  assert.doesNotMatch(login, /driverLicenseDocument/);
  assert.doesNotMatch(login, /ImagePicker|image_picker/);
  assert.doesNotMatch(authService, /licenseNotAvailable/);
  assert.doesNotMatch(authService, /driverLicenseDocument/);
  assert.doesNotMatch(authService, /MultipartFile|FormData/);
  assert.doesNotMatch(authEvent, /licenseNotAvailable/);
  assert.doesNotMatch(authEvent, /driverLicenseDocument/);
});
