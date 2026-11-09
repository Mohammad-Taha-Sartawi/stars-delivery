const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  providerVisibilityFilter,
  canProviderSeeOrder,
  orderResponderFilter,
  customerProviderVisibilityFilter,
} = require('../src/services/orderVisibility');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

const provider = {
  area: 'Beit Jala',
  governorate: 'بيت لحم',
  governorateLevel: true,
};

const sameAreaOrder = {
  area: 'Beit Jala',
  governorate: 'بيت لحم',
  governorateLevel: false,
};

const crossAreaOrder = {
  area: 'Bethlehem',
  governorate: 'بيت لحم',
  governorateLevel: true,
};

test('governorate-level orders require consent from both sides', () => {
  assert.equal(canProviderSeeOrder(provider, sameAreaOrder), true);
  assert.equal(canProviderSeeOrder(provider, crossAreaOrder), true);

  assert.equal(
    canProviderSeeOrder(
      { ...provider, governorateLevel: false },
      crossAreaOrder,
    ),
    false,
  );

  assert.equal(
    canProviderSeeOrder(
      provider,
      { ...crossAreaOrder, governorateLevel: false },
    ),
    false,
  );

  assert.equal(
    canProviderSeeOrder(provider, {
      ...crossAreaOrder,
      governorate: 'الخليل',
    }),
    false,
  );
});

test('provider feed exposes the governorate clause only when enabled', () => {
  const enabled = providerVisibilityFilter(provider);
  assert.deepEqual(enabled.$or, [
    { area: 'Beit Jala' },
    { governorate: 'بيت لحم', governorateLevel: true },
  ]);

  const disabled = providerVisibilityFilter({
    ...provider,
    governorateLevel: false,
  });
  assert.deepEqual(disabled.$or, [{ area: 'Beit Jala' }]);
});

test('legacy provider area still matches governorate-level orders', () => {
  const legacyProvider = {
    area: 'بيت لحم',
    governorateLevel: true,
  };
  const order = {
    area: 'Al-Dawha',
    governorate: 'بيت لحم',
    governorateLevel: true,
  };

  assert.equal(canProviderSeeOrder(legacyProvider, order), true);
  assert.deepEqual(providerVisibilityFilter(legacyProvider).$or, [
    { area: 'بيت لحم' },
    { governorate: 'بيت لحم', governorateLevel: true },
  ]);

  const responders = orderResponderFilter(order);
  assert.ok(responders.$or[1].$or[1].area.$in.includes('بيت لحم'));
  assert.ok(responders.$or[1].$or[1].area.$in.includes('Al-Dawha'));
});

test('responder and customer filters use the same governorate rules', () => {
  const responderFilter = orderResponderFilter(crossAreaOrder);
  assert.deepEqual(responderFilter.$or[0], { area: 'Bethlehem' });
  assert.equal(responderFilter.$or[1].governorateLevel, true);
  assert.deepEqual(responderFilter.$or[1].$or[0], {
    governorate: 'بيت لحم',
  });
  assert.ok(
    responderFilter.$or[1].$or[1].area.$in.includes('بيت لحم'),
  );

  const customerFilter = customerProviderVisibilityFilter({
    area: 'Bethlehem',
    governorate: 'بيت لحم',
    governorateLevel: true,
  });
  assert.deepEqual(customerFilter.$or[0], { area: 'Bethlehem' });
  assert.equal(customerFilter.$or[1].governorateLevel, true);
  assert.deepEqual(customerFilter.$or[1].$or[0], {
    governorate: 'بيت لحم',
  });
});

test('orders store governorate scope and socket rooms follow the setting', () => {
  const orderModel = source('src/models/Order.js');
  const ordersRoute = source('src/routes/orders.js');
  const userModel = source('src/models/User.js');
  const usersRoute = source('src/routes/users.js');
  const authMiddleware = source('src/middleware/auth.js');
  const index = source('src/index.js');
  const lifecycle = source('src/services/orderLifecycle.js');

  assert.match(orderModel, /governorate:\s*\{ type: String/);
  assert.match(orderModel, /governorateLevel:\s*\{ type: Boolean/);
  assert.match(ordersRoute, /governorate:\s*orderGovernorate/);
  assert.match(ordersRoute, /governorateLevel:\s*orderGovernorateLevel/);
  assert.match(ordersRoute, /canProviderSeeOrder\(req\.authUser, order\)/);
  assert.match(ordersRoute, /except\(governorateRoom\)/);
  assert.match(lifecycle, /providerVisibilityFilter\(provider\)/);
  assert.match(lifecycle, /orderResponderFilter\(order\)/);

  assert.match(userModel, /governorateLevel:\s*\{ type: Boolean/);
  assert.match(usersRoute, /router\.put\('\/governorate-level'/);
  assert.match(authMiddleware, /governorate governorateLevel/);
  assert.match(index, /socket\.join\(`governorate:\$\{governorate\}`\)/);

  const auth = source('src/routes/auth.js');
  const adminDrivers = source('src/routes/adminDrivers.js');
  const userModelSource = source('src/models/User.js');
  assert.match(userModelSource, /governorateLevel:[^\n]*default:\s*false/);
  assert.match(auth, /governorateLevel:\s*false/);
  assert.equal(
    (adminDrivers.match(/governorateLevel:\s*false/g) || []).length,
    2,
  );
});

test('mobile screens expose the option and warnings on both sides', () => {
  const customerHome = source('../lib/screens/home_screen.dart');
  const providerHome = source('../lib/screens/provider_home_screen.dart');
  const createOrder = source('../lib/screens/create_order_screen.dart');
  const pendingOrders = source('../lib/screens/pending_orders_screen.dart');

  assert.match(customerHome, /GovernorateScopeCard/);
  assert.match(providerHome, /GovernorateScopeCard/);
  assert.match(createOrder, /showGovernorateScopeWarning/);
  assert.match(createOrder, /governorateOrderBanner/);
  assert.match(pendingOrders, /showGovernorateScopeWarning/);
  assert.match(pendingOrders, /_isOutsideArea/);
});
