const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { notAcceptedOrderIds } = require('../src/services/driverOrderStats');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('not accepted orders combine rejections, unaccepted offers and expiry', () => {
  const now = new Date('2026-11-09T15:00:00.000Z');
  const ids = notAcceptedOrderIds({
    acceptedOrderIds: ['order-accepted'],
    rejectedOrderIds: ['order-rejected'],
    offers: [
      { orderId: 'order-customer-rejected', status: 'rejected' },
      { orderId: 'order-expired', status: 'pending', expiresAt: '2026-11-09T14:00:00.000Z' },
      { orderId: 'order-pending', status: 'pending', expiresAt: '2026-11-09T16:00:00.000Z' },
      { orderId: 'order-accepted', status: 'rejected' },
    ],
    now,
  });

  assert.deepEqual(ids.sort(), [
    'order-customer-rejected',
    'order-expired',
    'order-rejected',
  ]);
});

test('driver details expose accepted and not accepted order totals', () => {
  const routes = source('src/routes/adminDrivers.js');
  const main = source('src/public/js/main.js');

  assert.match(routes, /acceptedOrdersCount = orders\.length/);
  assert.match(routes, /notAcceptedOrderIds\(/);
  assert.match(routes, /Offer\.find\(\{ providerId: match\._id \}\)/);
  assert.match(routes, /notAcceptedOrdersCount/);
  assert.match(routes, /acceptedOrdersCount,/);
  assert.match(routes, /notAcceptedOrdersCount,/);

  assert.match(main, /إجمالي الطلبات المقبولة/);
  assert.match(main, /إجمالي الطلبات غير المقبولة/);
  assert.match(main, /الطلبات التي رفضها السائق/);
  assert.match(main, /انتهت مهلة قبول عرض السعر/);
});
