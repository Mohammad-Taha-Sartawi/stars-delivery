const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('admin driver creation supports governorate and village without image uploads', () => {
  const adminDrivers = source('src/routes/adminDrivers.js');
  const index = source('src/views/admin/index.ejs');
  const main = source('src/public/js/main.js');

  assert.doesNotMatch(adminDrivers, /upload\.single\('driverLicenseDocument'\)/);
  assert.match(adminDrivers, /driverGovernorate/);
  assert.match(adminDrivers, /isValidAreaForGovernorate/);
  assert.match(adminDrivers, /licenseNotAvailable/);
  assert.doesNotMatch(adminDrivers, /providerDocuments,\s*serviceTypes/);
  assert.match(adminDrivers, /area: requestedArea/);
  assert.match(adminDrivers, /governorate,/);

  assert.match(index, /id="driverGovernorateSelect"/);
  assert.match(index, /id="driverAreaSelect"/);
  assert.doesNotMatch(index, /driverLicenseDocument/);
  assert.doesNotMatch(index, /driverLicenseNotAvailable/);

  assert.match(main, /adminAreasByGovernorate/);
  assert.match(main, /const populateCities/);
  assert.match(main, /new FormData\(\)/);
  assert.match(main, /driverGovernorate: governorate/);
  assert.doesNotMatch(main, /append\('driverLicenseDocument'/);
});

test('orphan cleanup script removes offers and rejections without orders', () => {
  const script = source('src/scripts/cleanupOrphanRecords.js');
  const packageJson = JSON.parse(source('package.json'));

  assert.match(script, /orphanIds\(Offer, 'orderId'\)/);
  assert.match(script, /orphanIds\(RejectedOrder, 'orderId'\)/);
  assert.match(script, /from: 'orders'/);
  assert.match(script, /Offer\.deleteMany/);
  assert.match(script, /RejectedOrder\.deleteMany/);
  assert.equal(
    packageJson.scripts['data:cleanup-orphans'],
    'node src/scripts/cleanupOrphanRecords.js',
  );
});
