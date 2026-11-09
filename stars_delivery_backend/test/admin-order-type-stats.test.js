const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  orderStatBoundaries,
  normalizeOrderTypeCounts,
} = require('../src/services/orderStats');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('order counters split today and the full current month', () => {
  const now = new Date(2026, 10, 9, 15, 30, 0);
  const { startOfToday, startOfMonth } = orderStatBoundaries(now);

  assert.equal(startOfToday.getFullYear(), 2026);
  assert.equal(startOfToday.getMonth(), 10);
  assert.equal(startOfToday.getDate(), 9);
  assert.equal(startOfToday.getHours(), 0);
  assert.equal(startOfToday.getMinutes(), 0);

  assert.equal(startOfMonth.getFullYear(), 2026);
  assert.equal(startOfMonth.getMonth(), 10);
  assert.equal(startOfMonth.getDate(), 1);
  assert.equal(startOfMonth.getHours(), 0);
});

test('order type counters always include every customer order type', () => {
  const counts = normalizeOrderTypeCounts([
    { _id: 'product', today: 3, month: 12 },
    { _id: 'people', today: 1, month: 4 },
    { _id: 'goods', today: 0, month: 7 },
    { _id: 'unknown', today: 9, month: 9 },
  ]);

  assert.deepEqual(counts, {
    product: { today: 3, month: 12 },
    people: { today: 1, month: 4 },
    goods: { today: 0, month: 7 },
  });
});

test('admin stats aggregate customer orders by type and period', () => {
  const adminApi = source('src/routes/adminApi.js');

  assert.match(adminApi, /orderStatBoundaries/);
  assert.match(adminApi, /normalizeOrderTypeCounts/);
  assert.match(adminApi, /createdAt: \{ \$gte: startOfMonth \}/);
  assert.match(adminApi, /\$cond: \[\{ \$gte: \['\$createdAt', startOfToday\] \}, 1, 0\]/);
  assert.match(adminApi, /orderTypeCounts/);
});

test('dashboard shows monthly totals with today counts and no fake data', () => {
  const index = source('src/views/admin/index.ejs');
  const main = source('src/public/js/main.js');

  for (const id of [
    'prodCount',
    'prodToday',
    'passCount',
    'passToday',
    'cargoCount',
    'cargoToday',
  ]) {
    assert.match(index, new RegExp(`id="${id}"`));
  }

  assert.match(main, /orderCounts\.product/);
  assert.match(main, /orderCounts\.people/);
  assert.match(main, /orderCounts\.goods/);
  assert.match(main, /prodToday/);
  assert.match(main, /passToday/);
  assert.match(main, /cargoToday/);

  // The previous fake percentages, wait times and active counts are gone.
  assert.doesNotMatch(index, /\+12%/);
  assert.doesNotMatch(index, /prodWait|passWait|cargoWait/);
  assert.doesNotMatch(index, /prodActive|passActive|cargoActive/);
});
