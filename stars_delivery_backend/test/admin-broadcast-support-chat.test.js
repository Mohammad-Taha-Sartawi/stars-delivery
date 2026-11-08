const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const backendRoot = path.resolve(__dirname, '..');

function read(relative) {
  return fs.readFileSync(
    path.join(backendRoot, relative),
    'utf8',
  );
}

test('admin broadcasts are delivered into the contact_support chat', () => {
  const broadcast = read('src/routes/adminBroadcast.js');

  assert.match(
    broadcast,
    /const ChatMessage = require\('\.\.\/models\/ChatMessage'\);/,
  );

  assert.match(broadcast, /ChatMessage\.insertMany\(/);

  assert.match(broadcast, /sender: 'admin'/);

  assert.match(broadcast, /support_reply/);

  assert.match(broadcast, /io\.to\(`user:\$\{u\._id\}`\)\.emit\('support_reply'/);
});

test('support chat exposes unread count and read acknowledgement endpoints', () => {
  const chat = read('src/routes/chat.js');

  assert.match(chat, /router\.get\('\/unread-count'/);

  assert.match(chat, /router\.put\('\/read'/);

  assert.match(chat, /sender: 'admin',\s*read: false/);

  assert.match(chat, /updateMany\([\s\S]*?sender: 'admin'[\s\S]*?read: true/);
});

test('legacy dashboard user/driver messaging uses the app support chat store', () => {
  const adminChat = read('src/routes/adminChat.js');

  assert.match(adminChat, /const ChatMessage = require\('\.\.\/models\/ChatMessage'\);/);

  assert.match(adminChat, /ChatMessage\.create\(/);

  assert.match(adminChat, /ChatMessage\.find\(\{ userId \}\)/);

  assert.match(adminChat, /sender: 'admin'/);

  assert.match(adminChat, /support_reply/);

  assert.doesNotMatch(adminChat, /target\.messages/);

  assert.doesNotMatch(adminChat, /autoReply/);
});

test('dashboard support page connects its socket globally and refreshes conversations', () => {
  const main = read('src/public/js/main.js');

  assert.match(main, /initSupportChat\(\);/);

  assert.match(main, /withCredentials: true/);

  assert.match(main, /updateSupportBadge\(\)/);

  assert.match(main, /refreshLegacyChat\(\)/);
});
