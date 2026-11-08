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
  'blocked or unavailable providers receive no available orders',
  () => {
    const provider = source('src/routes/provider.js');

    assert.match(
      provider,
      /user\.blockedUntil > new Date\(\)/,
    );

    assert.match(provider, /blocked \|\| unavailable/);

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

    const users = source('src/routes/users.js');

    assert.match(users, /isAvailable: \{ \$ne: false \}/);
  },
);
