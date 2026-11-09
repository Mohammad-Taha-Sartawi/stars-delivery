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
  'unavailable providers keep the pending counter but cannot receive or offer',
  () => {
    const provider = source('src/routes/provider.js');
    const lifecycle = source('src/services/orderLifecycle.js');

    assert.match(
      provider,
      /user\.blockedUntil > new Date\(\)/,
    );

    // The paused driver still sees the live counter so they know that orders
    // are waiting, but the order list itself remains closed.
    assert.match(
      provider,
      /blocked\s*\?\s*0\s*:\s*await Order\.countDocuments\(areaFilter\)/,
    );

    assert.match(provider, /user\.isAvailable === false/);

    assert.match(
      provider,
      /blockedUntil: blocked \? user\.blockedUntil : null/,
    );

    assert.match(
      provider,
      /router\.put\('\/availability'/,
    );

    assert.match(provider, /isAvailable: available/);

    assert.match(
      provider,
      /isAvailable: user\.isAvailable !== false/,
    );

    // Server-side gate: no price offer can be submitted while paused.
    assert.match(
      lifecycle,
      /isAvailable: \{ \$ne: false \}/,
    );
    assert.match(lifecycle, /PROVIDER_UNAVAILABLE/);

    const users = source('src/routes/users.js');

    assert.match(users, /isAvailable: \{ \$ne: false \}/);
  },
);
