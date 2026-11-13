const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const { adminPasswordMatches } = require('../src/security/adminPassword');

const adminAuth = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'routes', 'adminAuth.js'),
  'utf8',
);

test('a changed admin password works when typed with stray edge spaces', async () => {
  const hash = await bcrypt.hash('Cedar!River2026#Admin', 4);
  assert.equal(await adminPasswordMatches('Cedar!River2026#Admin', hash), true);
  // Phone keyboards add a trailing space after ".com"-like words.
  assert.equal(await adminPasswordMatches('Cedar!River2026#Admin ', hash), true);
  assert.equal(await adminPasswordMatches(' Cedar!River2026#Admin', hash), true);
  assert.equal(await adminPasswordMatches('Cedar!River2026#Admi', hash), false);
  assert.equal(await adminPasswordMatches('   ', hash), false);
  assert.equal(await adminPasswordMatches(undefined, hash), false);
});

test('a password that really has edge spaces still matches exactly', async () => {
  const hash = await bcrypt.hash(' spaced password 2026 ', 4);
  assert.equal(await adminPasswordMatches(' spaced password 2026 ', hash), true);
});

test('sign-in, password change and 2FA use the same password check', () => {
  assert.match(adminAuth, /const passwordMatches = await adminPasswordMatches\(/);
  assert.match(adminAuth, /adminPasswordMatches\(currentPassword, admin\.password\)/);
  assert.match(adminAuth, /adminPasswordMatches\(password, admin\.password\)/);
  assert.doesNotMatch(adminAuth, /bcrypt\.compare\(/);
  // The new password is stored the way the dashboard form sends it.
  assert.match(adminAuth, /req\.body\.newPassword\.trim\(\)/);
});

test('a locked sign-in says so instead of "invalid credentials"', () => {
  const handlers = adminAuth.match(/handler: \(req, res\) => res\.status\(429\)\.render\('login', \{ error: (\w+) \}\)/g) || [];
  assert.equal(handlers.length, 2);
  for (const handler of handlers) {
    assert.match(handler, /tooManyAttemptsMessage/);
  }
  assert.match(adminAuth, /انتظر 15 دقيقة/);
});
