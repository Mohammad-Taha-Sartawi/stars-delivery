const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ContactRequest =
  require('../src/models/ContactRequest');

const {
  ContactValidationError,
  normalizeContactPayload,
  isReservedGuestEmail,
  contactConversationId,
  parseContactConversationId,
  formatContactMessage,
} = require('../src/services/contactRequest');

test('public contact payload is normalized without creating an application identity', () => {
  const result = normalizeContactPayload({
    name: '  Visitor  ',
    email: '  Visitor@Example.COM ',
    phone: ' 0599000000 ',
    text: '  Please contact me. ',
  });

  assert.deepEqual(result, {
    name: 'Visitor',
    email: 'visitor@example.com',
    phone: '0599000000',
    text: 'Please contact me.',
  });
});

test('public contact requires non-empty message text', () => {
  assert.throws(
    () => normalizeContactPayload({ text: '   ' }),
    (error) =>
      error instanceof ContactValidationError
      && error.code === 'CONTACT_MESSAGE_REQUIRED',
  );
});

test('public contact requires at least one external contact method', () => {
  assert.throws(
    () => normalizeContactPayload({
      name: 'Visitor',
      text: 'Please contact me.',
    }),
    (error) =>
      error instanceof ContactValidationError
      && error.code === 'CONTACT_METHOD_REQUIRED',
  );

  assert.doesNotThrow(
    () => normalizeContactPayload({
      name: 'Visitor',
      email: 'visitor@example.com',
      text: 'Please contact me.',
    }),
  );

  assert.doesNotThrow(
    () => normalizeContactPayload({
      name: 'Visitor',
      phone: '0599000000',
      text: 'Please contact me.',
    }),
  );
});

test('public contact rejects malformed and reserved guest email addresses', () => {
  assert.throws(
    () => normalizeContactPayload({
      email: 'not-an-email',
      text: 'hello',
    }),
    (error) =>
      error.code === 'CONTACT_EMAIL_INVALID',
  );

  assert.throws(
    () => normalizeContactPayload({
      email: 'contact_123@guest.local',
      text: 'hello',
    }),
    (error) =>
      error.code === 'CONTACT_EMAIL_INVALID',
  );
});

test('public contact fields have explicit maximum lengths', () => {
  assert.throws(
    () => normalizeContactPayload({
      text: 'x'.repeat(2001),
    }),
    (error) =>
      error.code === 'CONTACT_FIELD_TOO_LONG',
  );

  assert.throws(
    () => normalizeContactPayload({
      name: 'x'.repeat(101),
      text: 'hello',
    }),
    (error) =>
      error.code === 'CONTACT_FIELD_TOO_LONG',
  );
});

test('legacy guest email namespace is permanently reserved', () => {
  assert.equal(
    isReservedGuestEmail('contact_123@guest.local'),
    true,
  );

  assert.equal(
    isReservedGuestEmail('CONTACT@GUEST.LOCAL'),
    true,
  );

  assert.equal(
    isReservedGuestEmail('customer@example.com'),
    false,
  );
});

test('contact conversation ids are explicit and strictly parsed', () => {
  const id = '64b7c38f3f8b07f0c1234567';

  assert.equal(
    contactConversationId(id),
    `contact:${id}`,
  );

  assert.equal(
    parseContactConversationId(`contact:${id}`),
    id,
  );

  assert.equal(
    parseContactConversationId(
      'contact:not-object-id',
    ),
    null,
  );

  assert.equal(
    parseContactConversationId(id),
    null,
  );
});

test('contact message formatting retains supplied metadata', () => {
  assert.equal(
    formatContactMessage({
      name: 'Visitor',
      email: 'visitor@example.com',
      phone: '0599000000',
      text: 'Need help',
    }),
    '[Visitor] [visitor@example.com] [0599000000]\nNeed help',
  );
});

test('ContactRequest schema cannot represent an application account', () => {
  const schemaPaths = ContactRequest.schema.paths;

  assert.ok(schemaPaths.name);
  assert.ok(schemaPaths.email);
  assert.ok(schemaPaths.phone);
  assert.ok(schemaPaths.text);
  assert.ok(schemaPaths.resolved);

  assert.equal(schemaPaths.password, undefined);
  assert.equal(schemaPaths.role, undefined);
  assert.equal(schemaPaths.userId, undefined);
  assert.equal(schemaPaths.publicId, undefined);
});

test('public contact route never creates User or stores guest credentials', () => {
  const route = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'src',
      'routes',
      'chat.js',
    ),
    'utf8',
  );

  const start =
    route.indexOf("router.post('/contact'");

  const end =
    route.indexOf(
      "router.delete('/admin/resolve",
      start,
    );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const publicContactRoute =
    route.slice(start, end);

  assert.match(
    publicContactRoute,
    /publicContactLimiter/,
  );

  assert.match(
    publicContactRoute,
    /ContactRequest\.create/,
  );

  assert.doesNotMatch(
    publicContactRoute,
    /User\.create/,
  );

  const historicalGuestCredential =
    ['guest', 'placeholder'].join('_');

  assert.equal(
    publicContactRoute.includes(
      historicalGuestCredential,
    ),
    false,
  );

  assert.doesNotMatch(
    publicContactRoute,
    /@guest\.local/,
  );
});

test('public contact has a dedicated anti-abuse limiter', () => {
  const route = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'src',
      'routes',
      'chat.js',
    ),
    'utf8',
  );

  assert.match(
    route,
    /windowMs:\s*15 \* 60 \* 1000/,
  );

  assert.match(
    route,
    /limit:\s*5/,
  );

  assert.match(
    route,
    /CONTACT_RATE_LIMITED/,
  );
});

test('legacy guest domain is blocked before registration and login database lookup', () => {
  const authRoute = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'src',
      'routes',
      'auth.js',
    ),
    'utf8',
  );

  const normalizers =
    authRoute.match(
      /normalizeMobileEmail\(email\)/g,
    ) || [];

  const guards =
    authRoute.match(
      /isReservedGuestEmail\(normalizedEmail\)/g,
    ) || [];

  assert.equal(
    normalizers.length,
    2,
  );

  assert.equal(
    guards.length,
    2,
  );

  const registrationNormalize =
    authRoute.indexOf(
      'normalizeMobileEmail(email)',
    );

  const registrationGuard =
    authRoute.indexOf(
      'isReservedGuestEmail(normalizedEmail)',
    );

  const registrationLookup =
    authRoute.indexOf(
      'const existingUser',
    );

  assert.ok(
    registrationNormalize
    < registrationGuard,
  );

  assert.ok(
    registrationGuard
    < registrationLookup,
  );

  const loginNormalize =
    authRoute.lastIndexOf(
      'normalizeMobileEmail(email)',
    );

  const loginGuard =
    authRoute.lastIndexOf(
      'isReservedGuestEmail(normalizedEmail)',
    );

  const loginLookup =
    authRoute.indexOf(
      'const user = await User.findOne',
    );

  assert.ok(
    loginNormalize
    < loginGuard,
  );

  assert.ok(
    loginGuard
    < loginLookup,
  );
});

test('support message renderer treats message text as text rather than HTML', () => {
  const adminJs = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'src',
      'public',
      'js',
      'main.js',
    ),
    'utf8',
  );

  const start =
    adminJs.indexOf(
      'function appendChatMessage(',
    );

  const end =
    adminJs.indexOf(
      'async function sendAdminReply',
      start,
    );

  const renderer =
    adminJs.slice(start, end);

  assert.match(
    renderer,
    /body\.textContent = text \|\| ''/,
  );

  assert.doesNotMatch(
    renderer,
    /innerHTML\s*=.*text/,
  );
});

test('conversation list renders untrusted names and previews with textContent', () => {
  const adminJs = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'src',
      'public',
      'js',
      'main.js',
    ),
    'utf8',
  );

  const start =
    adminJs.indexOf(
      'function renderConversations()',
    );

  const end =
    adminJs.indexOf(
      'async function openSupportChat',
      start,
    );

  const renderer =
    adminJs.slice(start, end);

  assert.match(
    renderer,
    /name\.textContent = userName/,
  );

  assert.match(
    renderer,
    /preview\.textContent = conversation\.lastMessage \|\| ''/,
  );

  assert.match(
    renderer,
    /addEventListener\('click'/,
  );
});

test('support header does not interpolate untrusted identity into HTML', () => {
  const adminJs = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'src',
      'public',
      'js',
      'main.js',
    ),
    'utf8',
  );

  const start =
    adminJs.indexOf(
      'async function openSupportChat(',
    );

  const end =
    adminJs.indexOf(
      'async function loadChatMessages',
      start,
    );

  const block =
    adminJs.slice(start, end);

  assert.match(
    block,
    /identity\.textContent/,
  );

  assert.match(
    block,
    /resolveButton\.addEventListener/,
  );

  assert.doesNotMatch(
    block,
    /onclick=.*userName/,
  );
});

test('public contacts cannot receive in-app administrator replies', () => {
  const route = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'src',
      'routes',
      'chat.js',
    ),
    'utf8',
  );

  assert.match(
    route,
    /CONTACT_REPLY_EXTERNAL_ONLY/,
  );
});

test('ContactRequest indexes are initialized by server startup', () => {
  const indexSource = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'src',
      'index.js',
    ),
    'utf8',
  );

  assert.match(
    indexSource,
    /ContactRequest\.createIndexes\(\)/,
  );
});

test('legacy guest audit is read-only for User records', () => {
  const audit = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'src',
      'scripts',
      'auditLegacyContactUsers.js',
    ),
    'utf8',
  );

  assert.match(
    audit,
    /User\.find\(/,
  );

  assert.match(
    audit,
    /passwordUsesBcrypt/,
  );

  assert.match(
    audit,
    /nonBcryptPasswordUsers/,
  );

  assert.doesNotMatch(
    audit,
    /User\.(delete|deleteMany|update|updateOne|updateMany|findOneAndUpdate)/,
  );
});

test('legacy guest audit contains no known plaintext guest credential', () => {
  const audit = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'src',
      'scripts',
      'auditLegacyContactUsers.js',
    ),
    'utf8',
  );

  const historicalGuestCredential =
    ['guest', 'placeholder'].join('_');

  assert.equal(
    audit.includes(historicalGuestCredential),
    false,
  );
});
