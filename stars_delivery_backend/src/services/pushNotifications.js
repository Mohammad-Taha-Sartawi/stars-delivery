const fs = require('fs');
const PushToken = require('../models/PushToken');

// firebase-admin v14 only exposes the modular API (firebase-admin/app,
// firebase-admin/messaging); the old `admin.credential` / `admin.messaging()`
// namespace is gone, which silently disabled every push before this.
let firebaseApp = null;
let messagingClient = null;
let initializationAttempted = false;

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (_) {
      return null;
    }
  }

  const accountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (accountPath) {
    try {
      return JSON.parse(fs.readFileSync(accountPath, 'utf8'));
    } catch (_) {
      return null;
    }
  }

  return null;
}

function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;
  if (initializationAttempted) return null;
  initializationAttempted = true;

  try {
    const credentials = loadServiceAccount();
    if (!credentials) return null;

    const { initializeApp, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    firebaseApp = initializeApp(
      { credential: cert(credentials) },
      'stars-delivery-push',
    );
    messagingClient = getMessaging(firebaseApp);
    return firebaseApp;
  } catch (error) {
    console.error(
      'Firebase Admin initialization skipped:',
      String(error?.message || error).split('\n')[0],
    );
    return null;
  }
}

function stringData(data = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
}

async function sendPushToTokens(tokens, { title, body, data = {} }) {
  const app = getFirebaseApp();
  if (!app || !messagingClient || tokens.length === 0) return;

  const message = {
    tokens,
    notification: { title, body },
    data: stringData(data),
    android: {
      priority: 'high',
      notification: {
        channelId: 'stars_delivery_default',
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          'content-available': 1,
        },
      },
    },
  };

  try {
    const result = await messagingClient.sendEachForMulticast(message);
    const invalidTokens = [];

    result.responses.forEach((response, index) => {
      if (response.success) return;
      const code = response.error?.code || '';
      if (
        code === 'messaging/registration-token-not-registered'
        || code === 'messaging/invalid-registration-token'
        || code === 'messaging/invalid-argument'
      ) {
        invalidTokens.push(tokens[index]);
      }
    });

    if (invalidTokens.length > 0) {
      await PushToken.deleteMany({ token: { $in: invalidTokens } });
    }
  } catch (error) {
    console.error(
      'Push delivery failed:',
      String(error?.message || error).split('\n')[0],
    );
  }
}

async function sendPushToUser(userId, payload) {
  if (!userId) return;
  const tokens = await PushToken.find({ userId }).select('token').lean();
  await sendPushToTokens(tokens.map((row) => row.token), payload);
}

async function sendPushToUsers(userIds, payload) {
  const ids = [...new Set((userIds || []).map(String))].filter(Boolean);
  if (ids.length === 0) return;

  const tokens = await PushToken.find({ userId: { $in: ids } })
    .select('token')
    .lean();
  await sendPushToTokens(tokens.map((row) => row.token), payload);
}

/** Test seam: replace the FCM client (and mark Firebase as ready). */
function setMessagingClientForTesting(client) {
  messagingClient = client;
  firebaseApp = client ? { name: 'test' } : null;
  initializationAttempted = true;
}

module.exports = {
  sendPushToUser,
  sendPushToUsers,
  sendPushToTokens,
  setMessagingClientForTesting,
};
