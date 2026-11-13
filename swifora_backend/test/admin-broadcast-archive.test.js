const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('sent broadcasts are archived for one month', () => {
  const model = source('src/models/BroadcastMessage.js');
  const broadcast = source('src/routes/adminBroadcast.js');
  const index = source('src/index.js');

  assert.match(model, /target:/);
  assert.match(model, /title:/);
  assert.match(model, /body:/);
  assert.match(model, /recipientCount:/);
  assert.match(model, /sentAt:/);
  assert.match(model, /expireAt:/);
  assert.match(model, /expireAfterSeconds: 0/);
  assert.match(model, /30 \* 24 \* 60 \* 60 \* 1000/);

  assert.match(broadcast, /BroadcastMessage\.create\(/);
  assert.match(broadcast, /router\.get\('\/archive\/:target'/);
  assert.match(broadcast, /sentAt: \{ \$gte: since \}/);
  assert.match(broadcast, /30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(index, /BroadcastMessage\.createIndexes\(\)/);
});

test('the dashboard shows the archive for drivers and users', () => {
  const index = source('src/views/admin/index.ejs');
  const main = source('src/public/js/main.js');

  assert.match(index, /id="driverBroadcastArchive"/);
  assert.match(index, /id="userBroadcastArchive"/);
  assert.match(index, /يُحذف تلقائياً بعد 30 يوماً/);
  assert.match(main, /loadBroadcastArchive\(/);
  assert.match(main, /adminFetch\(`\/admin\/broadcast\/archive\/\$\{target\}`\)/);
  assert.match(main, /archive-item/);
});
