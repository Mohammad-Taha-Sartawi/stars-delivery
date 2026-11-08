const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test(
  'single order lookup is authenticated and scoped to owners or matching providers',
  () => {
    const routes = source('src/routes/orders.js');

    assert.match(
      routes,
      /router\.get\(\s*'\/:id'\s*,\s*auth\s*,/,
    );

    assert.match(routes, /isCustomer/);

    assert.match(routes, /isAssignedProvider/);

    assert.match(routes, /isAvailableProvider/);

    assert.match(routes, /req\.userRole === 'provider'/);

    assert.match(
      routes,
      /slice\(0, -3\) \+ '\*\*\*'/,
    );

    assert.match(routes, /order\.myOffer = offer \|\| null/);

    assert.match(routes, /order\.rejected = Boolean\(rejected\)/);

    assert.match(routes, /rejectedByDriversCount/);

    assert.match(routes, /RejectedOrder\.countDocuments/);

    assert.match(routes, /reason: 'driver_rejected'/);
  },
);
