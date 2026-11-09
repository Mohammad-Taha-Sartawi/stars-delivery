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

  assert.match(provider, /splitCommission\(dailyOrders,\s*user\)/);
  assert.match(provider, /splitCommission\(\s*monthlyOrders,\s*user,?\s*\)/);
  assert.match(provider, /dailyCommission: dailyCommissionDue/);
  assert.match(provider, /monthlyCommission: monthlyCommissionDue/);
});

test('provider report counter ignores rejections whose order was deleted', () => {
  const provider = source('src/routes/provider.js');

  assert.match(provider, /RejectedOrder\.aggregate\(/);
  assert.match(provider, /\$lookup: \{\s*from: 'orders'/);
  assert.match(provider, /\$match: \{ 'order\.0': \{ \$exists: true \} \}/);
  assert.match(provider, /ordersReportCount/);
});
