const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test(
  'customer and driver notification feeds expose only admin broadcasts',
  () => {
    const notifications = source('src/routes/notifications.js');

    assert.match(
      notifications,
      /Notification\.find\(\{\s*userId: req\.userId,\s*type: 'broadcast',/s,
    );

    assert.match(
      notifications,
      /Notification\.countDocuments\(\{\s*userId: req\.userId,\s*type: 'broadcast',\s*read: false/s,
    );

    assert.match(
      notifications,
      /Notification\.updateMany\(\{\s*userId: req\.userId,\s*type: 'broadcast',\s*read: false/s,
    );
  },
);

test(
  'order and offer activity no longer creates app notifications',
  () => {
    assert.doesNotMatch(
      source('src/services/orderLifecycle.js'),
      /Notification\.create/,
    );

    const orders = source('src/routes/orders.js');

    assert.doesNotMatch(orders, /Notification\.insertMany/);

    assert.doesNotMatch(orders, /type: 'new_order'/);
  },
);
