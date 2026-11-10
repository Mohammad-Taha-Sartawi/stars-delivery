const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  DEFAULT_COMMISSION,
  calculateCommission,
  normalizeCommissionConfig,
} = require('../src/services/commissionSettings');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('commission settings default to the existing one-shekel amount', () => {
  assert.deepEqual(DEFAULT_COMMISSION, { type: 'fixed', value: 1 });
  assert.equal(calculateCommission(25, undefined), 1);
});

test('fixed and percentage commission values are calculated safely', () => {
  assert.equal(
    calculateCommission(25, { type: 'fixed', value: 2.5 }),
    2.5,
  );
  assert.equal(
    calculateCommission(25, { type: 'percent', value: 10 }),
    2.5,
  );
  assert.equal(
    calculateCommission(25, { type: 'percent', value: 100 }),
    25,
  );
  assert.equal(
    calculateCommission(5, { type: 'fixed', value: 10 }),
    5,
  );
  assert.deepEqual(
    normalizeCommissionConfig({ type: 'percent', value: 7.5 }),
    { type: 'percent', value: 7.5 },
  );
  assert.deepEqual(
    normalizeCommissionConfig({ type: 'invalid', value: -3 }),
    { type: 'fixed', value: 1 },
  );
});

test('new accepted offers use the configured commission snapshot', () => {
  const lifecycle = source('src/services/orderLifecycle.js');
  const offers = source('src/routes/offers.js');
  const adminApi = source('src/routes/adminApi.js');

  assert.match(lifecycle, /calculateCommission\(/);
  assert.match(lifecycle, /platformCommission,/);
  assert.match(lifecycle, /providerEarning,/);
  assert.match(offers, /getCommissionConfig\(\)/);
  assert.match(offers, /commissionConfig/);
  assert.match(adminApi, /router\.get\('\/commission-settings'/);
  assert.match(adminApi, /router\.put\('\/commission-settings'/);
  assert.match(adminApi, /CommissionSetting\.findOneAndUpdate/);
});
