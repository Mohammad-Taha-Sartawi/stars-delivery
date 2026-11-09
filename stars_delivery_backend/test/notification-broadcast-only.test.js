const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('customer and driver notification feeds include all notification types', () => {
  const notifications = source('src/routes/notifications.js');

  assert.match(
    notifications,
    /Notification\.find\(\{\s*userId: req\.userId,\s*\}\)/s,
  );
  assert.doesNotMatch(
    notifications,
    /type: 'broadcast',\s*read: false/,
  );

  assert.match(notifications, /Notification\.countDocuments/);
  assert.match(notifications, /Notification\.updateMany/);
});

test('admin broadcasts remain notification-only and do not touch support chat', () => {
  const broadcast = source('src/routes/adminBroadcast.js');

  assert.doesNotMatch(broadcast, /ChatMessage/);
  assert.doesNotMatch(broadcast, /support_reply/);
  assert.match(broadcast, /BroadcastMessage\.create/);
});

test('order, offer and report activity creates persisted notifications', () => {
  const offers = source('src/routes/offers.js');
  const orders = source('src/routes/orders.js');
  const reports = source('src/routes/adminReports.js');

  assert.match(offers, /createUserNotification/);
  assert.match(offers, /type: 'new_offer'/);
  assert.match(offers, /type: 'offer_accepted'/);
  assert.match(orders, /type: 'order_pending'/);
  assert.match(orders, /type: 'order_completed'/);
  assert.match(reports, /type: 'report_reply'/);
});
