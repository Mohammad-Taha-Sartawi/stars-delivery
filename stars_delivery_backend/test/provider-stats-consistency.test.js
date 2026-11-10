const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('provider stats stop showing due commission after payment', () => {
  const provider = source('src/routes/provider.js');
  const providerHome = source('../lib/screens/provider_home_screen.dart');

  assert.match(
    provider,
    /splitCommission\(\s*dailyOrders,\s*user,\s*\{\s*includeAdjustment:\s*false\s*\}/,
  );
  assert.match(
    provider,
    /splitCommission\(\s*monthlyOrders,\s*user,\s*\{\s*includeAdjustment:\s*false\s*\}/,
  );
  assert.match(provider, /splitCommission\(\s*allCommissionOrders,\s*user,?\s*\)/);
  assert.match(provider, /dailyCommission: dailyCommissionDue/);
  assert.match(provider, /monthlyCommission: monthlyCommissionDue/);
  assert.match(provider, /totalCommissionDue/);
  assert.match(providerHome, /s\.totalCommissionDue/);
});

test('provider report counter ignores rejections whose order was deleted', () => {
  const provider = source('src/routes/provider.js');

  assert.match(provider, /RejectedOrder\.aggregate\(/);
  assert.match(provider, /\$lookup: \{\s*from: 'orders'/);
  assert.match(provider, /\$match: \{ 'order\.0': \{ \$exists: true \} \}/);
  assert.match(provider, /ordersReportCount/);
});
