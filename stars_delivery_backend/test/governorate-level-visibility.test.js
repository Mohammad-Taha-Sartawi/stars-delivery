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

test('governorate scope is the driver\'s choice alone', () => {
  assert.equal(canProviderSeeOrder(provider, sameAreaOrder), true);
  assert.equal(canProviderSeeOrder(provider, crossAreaOrder), true);

  // The customer side no longer matters: an order without the flag still
  // reaches a governorate-level driver in the same governorate.
  assert.equal(
    canProviderSeeOrder(provider, { ...crossAreaOrder, governorateLevel: false }),
    true,
  );

  // A village-only driver sees only their own village.
  assert.equal(
    canProviderSeeOrder({ ...provider, governorateLevel: false }, crossAreaOrder),
    false,
  );

  // Never across governorates.
  assert.equal(
    canProviderSeeOrder(provider, { ...crossAreaOrder, governorate: 'الخليل' }),
    false,
  );
});

test('provider feed exposes the governorate clause only when the driver enabled it', () => {
  const enabled = providerVisibilityFilter(provider);
  assert.deepEqual(enabled.$or[0], { area: 'Beit Jala' });
  assert.deepEqual(enabled.$or[1], { governorate: 'بيت لحم' });
  // Older orders without a stored governorate match by village name.
  assert.ok(enabled.$or[2].area.$in.includes('Bethlehem'));

  const disabled = providerVisibilityFilter({
    ...provider,
    governorateLevel: false,
  });
  assert.deepEqual(disabled.$or, [{ area: 'Beit Jala' }]);
});

test('legacy provider area still matches orders across the governorate', () => {
  const legacyProvider = {
    area: 'بيت لحم',
    governorateLevel: true,
  };
  const order = {
    area: 'Al-Dawha',
    governorate: 'بيت لحم',
    governorateLevel: false,
  };

  assert.equal(canProviderSeeOrder(legacyProvider, order), true);
  assert.deepEqual(providerVisibilityFilter(legacyProvider).$or[1], {
    governorate: 'بيت لحم',
  });

  const responders = orderResponderFilter(order);
  assert.ok(responders.$or[1].$or[1].area.$in.includes('بيت لحم'));
  assert.ok(responders.$or[1].$or[1].area.$in.includes('Al-Dawha'));
});

test('every order reaches governorate-level drivers; customers have no setting', () => {
  const responderFilter = orderResponderFilter({
    ...crossAreaOrder,
    governorateLevel: false,
  });
  assert.deepEqual(responderFilter.$or[0], { area: 'Bethlehem' });
  assert.equal(responderFilter.$or[1].governorateLevel, true);
  assert.deepEqual(responderFilter.$or[1].$or[0], {
    governorate: 'بيت لحم',
  });

  // The "available drivers" count for a customer includes governorate-level
  // drivers whatever the customer's (now unused) flag says.
  for (const flag of [true, false]) {
    const customerFilter = customerProviderVisibilityFilter({
      area: 'Bethlehem',
      governorate: 'بيت لحم',
      governorateLevel: flag,
    });
    assert.deepEqual(customerFilter.$or[0], { area: 'Bethlehem' });
    assert.equal(customerFilter.$or[1].governorateLevel, true);
  }
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
  assert.match(usersRoute, /PROVIDER_ONLY/);
  assert.match(ordersRoute, /orderGovernorateLevel = false/);
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

test('only the driver app exposes the governorate option', () => {
  const customerHome = source('../lib/screens/home_screen.dart');
  const providerHome = source('../lib/screens/provider_home_screen.dart');
  const createOrder = source('../lib/screens/create_order_screen.dart');
  const pendingOrders = source('../lib/screens/pending_orders_screen.dart');

  assert.doesNotMatch(customerHome, /GovernorateScopeCard/);
  assert.match(providerHome, /GovernorateScopeCard/);
  assert.doesNotMatch(createOrder, /showGovernorateScopeWarning/);
  assert.doesNotMatch(createOrder, /governorateLevel/);
  assert.match(pendingOrders, /showGovernorateScopeWarning/);
  assert.match(pendingOrders, /_isOutsideArea/);
});
