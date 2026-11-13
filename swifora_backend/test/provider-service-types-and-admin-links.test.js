const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  normalizeServiceTypes,
  serviceTypesFromAdminLabel,
  serviceTypesLabel,
  driverCategoryForProvider,
} = require('../src/services/providerServiceTypes');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('provider service types normalize and map to dashboard labels', () => {
  assert.deepEqual(
    normalizeServiceTypes('people, product,product,unknown'),
    ['people', 'product'],
  );

  assert.deepEqual(
    serviceTypesFromAdminLabel('توصيل ركاب + منتجات'),
    ['product', 'people'],
  );

  assert.deepEqual(
    serviceTypesFromAdminLabel('الكل (ركاب + منتجات + بضائع)'),
    ['product', 'people', 'goods'],
  );

  assert.equal(serviceTypesLabel([]), 'جميع الخدمات');
  assert.equal(serviceTypesLabel(['goods']), 'نقل بضائع');
});

test('provider registration and approval preserve specialty data', () => {
  const auth = source('src/routes/auth.js');
  const adminDrivers = source('src/routes/adminDrivers.js');
  const pendingModel = source('src/models/PendingProvider.js');
  const userModel = source('src/models/User.js');

  assert.match(auth, /normalizeServiceTypes/);
  assert.match(auth, /serviceTypes,/);
  assert.match(pendingModel, /serviceTypes/);
  assert.match(userModel, /serviceTypes/);
  assert.match(adminDrivers, /serviceTypesFromAdminLabel/);
  assert.match(adminDrivers, /serviceTypes:\s*pending\.serviceTypes/);
});

test('driver category is derived from registered services and license type', () => {
  assert.equal(
    driverCategoryForProvider({ serviceTypes: ['product'] }),
    'motorcycle',
  );
  assert.equal(
    driverCategoryForProvider({ serviceTypes: ['people'] }),
    'private',
  );
  assert.equal(
    driverCategoryForProvider({ serviceTypes: ['goods'] }),
    'truck',
  );
  assert.equal(
    driverCategoryForProvider({ serviceTypes: ['product', 'people'] }),
    'public',
  );
  assert.equal(
    driverCategoryForProvider({
      serviceTypes: ['goods'],
      licenseType: 'سائق عمومي مرخص',
    }),
    'public',
  );
  assert.equal(
    driverCategoryForProvider({
      serviceTypes: [],
      licenseType: 'سائق نقل بضائع خاص',
    }),
    'truck',
  );
  assert.equal(
    driverCategoryForProvider({ serviceTypes: [] }),
    'unknown',
  );

  const offers = source('src/routes/offers.js');
  assert.match(offers, /driverCategoryForProvider/);
  assert.match(offers, /providerCategory/);
  assert.match(offers, /serviceTypes licenseType/);
});

test('provider order feed is scoped to the provider specialities', () => {
  const provider = source('src/routes/provider.js');
  const lifecycle = source('src/services/orderLifecycle.js');

  assert.match(provider, /normalizeServiceTypes\(user\.serviceTypes\)/);
  assert.match(provider, /areaFilter\.type = \{ \$in: serviceTypes \}/);
  assert.match(lifecycle, /providerServiceTypes/);
  assert.match(lifecycle, /orderFilter\.type = \{ \$in: providerServiceTypes \}/);
});

test('dashboard exposes orders, driver availability and driver reports', () => {
  const index = source('src/index.js');
  const adminDrivers = source('src/routes/adminDrivers.js');
  const adminOrders = source('src/routes/adminOrders.js');
  const adminApi = source('src/routes/adminApi.js');

  assert.match(
    index,
    /app\.use\('\/admin\/orders', requireAdminSession, adminCsrfProtection, adminOrderRoutes\)/,
  );

  assert.match(adminDrivers, /router\.put\('\/:id\/availability'/);
  assert.match(adminDrivers, /router\.get\('\/:id\/reports'/);
  assert.match(adminDrivers, /phoneNumbers\?\.find/);

  assert.match(adminOrders, /router\.post\('\/:id\/cancel'/);
  assert.match(adminOrders, /router\.post\('\/:id\/resend'/);
  assert.match(adminOrders, /router\.post\('\/:id\/end-suspension'/);
  assert.match(adminOrders, /router\.post\('\/:id\/offers\/:offerId\/reject'/);
  assert.match(adminOrders, /populate\('customerId'/);
  assert.match(adminOrders, /populate\('providerId'/);

  // Availability is now represented by the existing active/inactive driver
  // cards; a separate "available drivers" card was removed.
  assert.match(adminApi, /inactiveDrivers/);
  assert.match(adminApi, /isAvailable: false/);
  assert.match(adminApi, /isAvailable: \{ \$ne: false \}/);
  assert.doesNotMatch(adminApi, /availableDrivers/);
});

test('admin user search maps stored phone numbers', () => {
  const adminUsers = source('src/routes/adminUsers.js');

  assert.match(adminUsers, /phoneNumbers\?\.find/);
});
