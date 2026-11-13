const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PushToken = require('../src/models/PushToken');
const push = require('../src/services/pushNotifications');

test('push service uses the firebase-admin v14 modular API', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/services/pushNotifications.js'),
    'utf8',
  );
  // The legacy namespace (admin.credential / admin.messaging()) does not
  // exist in firebase-admin v14 and silently disabled all pushes.
  assert.match(source, /require\('firebase-admin\/app'\)/);
  assert.match(source, /require\('firebase-admin\/messaging'\)/);
  assert.doesNotMatch(source, /firebaseAdmin\./);
  assert.doesNotMatch(source, /require\('firebase-admin'\)/);

  const app = require('firebase-admin/app');
  const messaging = require('firebase-admin/messaging');
  assert.equal(typeof app.initializeApp, 'function');
  assert.equal(typeof app.cert, 'function');
  assert.equal(typeof messaging.getMessaging, 'function');
});

test('sends a visible, high-priority message and drops dead tokens', async (t) => {
  const sent = [];
  const deleted = [];
  t.mock.method(PushToken, 'deleteMany', async (filter) => {
    deleted.push(filter);
  });
  push.setMessagingClientForTesting({
    sendEachForMulticast: async (message) => {
      sent.push(message);
      return {
        responses: [
          { success: true },
          { success: false, error: { code: 'messaging/registration-token-not-registered' } },
          { success: false, error: { code: 'messaging/internal-error' } },
        ],
      };
    },
  });
  t.after(() => push.setMessagingClientForTesting(null));

  await push.sendPushToTokens(['ok', 'gone', 'flaky'], {
    title: 'طلب جديد',
    body: 'Al-Bireh',
    data: { type: 'new_order', orderId: 123, empty: null },
  });

  const message = sent[0];
  assert.deepEqual(message.tokens, ['ok', 'gone', 'flaky']);
  assert.deepEqual(message.notification, { title: 'طلب جديد', body: 'Al-Bireh' });
  // Data values must be strings for FCM; null values are dropped.
  assert.deepEqual(message.data, { type: 'new_order', orderId: '123' });
  assert.equal(message.android.priority, 'high');
  assert.equal(message.android.notification.channelId, 'stars_delivery_default');
  // Only the unregistered token is removed, not transient failures.
  assert.deepEqual(deleted, [{ token: { $in: ['gone'] } }]);
});
