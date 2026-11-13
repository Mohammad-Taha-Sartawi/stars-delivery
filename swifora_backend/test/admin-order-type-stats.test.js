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
    { _id: 'product', today: 3, month: 12, accepted: 8 },
    { _id: 'people', today: 1, month: 4, accepted: 4 },
    { _id: 'goods', today: 0, month: 7, accepted: 2 },
    { _id: 'unknown', today: 9, month: 9, accepted: 9 },
  ]);

  assert.deepEqual(counts, {
    product: { today: 3, month: 12, accepted: 8, notAccepted: 4 },
    people: { today: 1, month: 4, accepted: 4, notAccepted: 0 },
    goods: { today: 0, month: 7, accepted: 2, notAccepted: 5 },
  });
});

test('admin stats aggregate customer orders by type and period', () => {
  const adminApi = source('src/routes/adminApi.js');

  assert.match(adminApi, /orderStatBoundaries/);
  assert.match(adminApi, /normalizeOrderTypeCounts/);
  assert.match(adminApi, /createdAt: \{ \$gte: startOfMonth \}/);
  assert.match(adminApi, /\$cond: \[\{ \$gte: \['\$createdAt', startOfToday\] \}, 1, 0\]/);
  assert.match(adminApi, /orderTypeCounts/);
  assert.match(adminApi, /'accepted', 'fulfilling', 'completed'/);
  assert.match(adminApi, /accepted: \{/);
});

test('dashboard shows only accepted and not accepted order counters', () => {
  const index = source('src/views/admin/index.ejs');
  const main = source('src/public/js/main.js');

  for (const id of [
    'prodAccepted',
    'prodNotAccepted',
    'passAccepted',
    'passNotAccepted',
    'cargoAccepted',
    'cargoNotAccepted',
  ]) {
    assert.match(index, new RegExp(`id="${id}"`));
  }

  // The previous card totals and today counters were removed from the UI.
  for (const id of [
    'prodCount',
    'prodToday',
    'passCount',
    'passToday',
    'cargoCount',
    'cargoToday',
  ]) {
    assert.doesNotMatch(index, new RegExp(`id="${id}"`));
  }

  assert.match(main, /orderCounts\.product/);
  assert.match(main, /orderCounts\.people/);
  assert.match(main, /orderCounts\.goods/);
  assert.match(main, /prodAccepted/);
  assert.match(main, /prodNotAccepted/);
  assert.match(main, /passAccepted/);
  assert.match(main, /passNotAccepted/);
  assert.match(main, /cargoAccepted/);
  assert.match(main, /cargoNotAccepted/);
  assert.doesNotMatch(main, /prodCount/);
  assert.doesNotMatch(main, /prodToday/);

  // The previous fake percentages, wait times and active counts are gone.
  assert.doesNotMatch(index, /\+12%/);
  assert.doesNotMatch(index, /prodWait|passWait|cargoWait/);
  assert.doesNotMatch(index, /prodActive|passActive|cargoActive/);
});
