const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const lifecycle = require('../src/services/orderLifecycle');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test(
  'accepted offers reserve the provider for fifteen minutes',
  () => {
    assert.equal(
      lifecycle.PROVIDER_ACCEPTANCE_BLOCK_MS,
      15 * 60 * 1000,
    );
  },
);

test(
  'blocked providers receive no available orders or order notifications',
  () => {
    const provider = source('src/routes/provider.js');

    assert.match(
      provider,
      /user\.blockedUntil > new Date\(\)/,
    );

    assert.match(
      provider,
      /pendingOrdersCount = blocked \? 0/,
    );

    assert.match(
      provider,
      /blockedUntil: blocked \? user\.blockedUntil : null/,
    );

    const orders = source('src/routes/orders.js');

    assert.match(
      orders,
      /blockedUntil: \{ \$lte: new Date\(\) \}/,
    );
  },
);
