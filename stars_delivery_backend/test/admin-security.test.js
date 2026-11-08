const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const MongoStore = require('connect-mongo').default;
const requireAdminSession = require('../src/middleware/requireAdminSession');
const { createAdminSessionOptions } = require('../src/middleware/adminSession');
const { loadSecurityConfig, validateSecret } = require('../src/config');
const { isValidAdminPassword } = require('../src/security/passwordPolicy');
const authenticateSocket = require('../src/socket/authenticateSocket');

const secret = 'JwT7mQ2vL9xR4pN6sK8dF3hZ5cB1yG0u';
const sessionSecret = 'sE4nV8qA1rC6xM0pD7kL3wH9bF5zT2yN';

function assertThrows(fn, message) {
  assert.throws(fn, new RegExp(message));
}

function runAdminMiddleware(session, originalUrl = '/admin') {
  let nextCalled = false;
  let statusCode;
  let redirectPath;
  const req = { session, originalUrl };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json() { return this; },
    redirect(path) { redirectPath = path; return this; },
  };
  requireAdminSession(req, res, () => { nextCalled = true; });
  return { nextCalled, statusCode, redirectPath };
}

test('missing JWT secret is rejected', () => {
  assertThrows(() => loadSecurityConfig({ SESSION_SECRET: secret }), 'JWT_SECRET is required');
});

test('missing session secret is rejected', () => {
  assertThrows(() => loadSecurityConfig({ JWT_SECRET: secret }), 'SESSION_SECRET is required');
});

test('weak security secrets are rejected', () => {
  assertThrows(() => validateSecret('JWT_SECRET', 'short'), 'at least 32 characters');
});

test('valid security secrets are accepted without changing them', () => {
  const config = loadSecurityConfig({ JWT_SECRET: secret, SESSION_SECRET: sessionSecret });
  assert.equal(config.jwtSecret, secret);
  assert.equal(config.sessionSecret, sessionSecret);
});

test('known and documented placeholder secrets are rejected', () => {
  for (const value of [
    'stars_delivery_secret_key_2026',
    'tahakum-secret-key-2025',
    'replace-with-a-random-secret-at-least-32-characters',
    'replace-with-a-different-random-secret-at-least-32-chars',
  ]) {
    assert.throws(() => validateSecret('JWT_SECRET', value));
  }
});

test('JWT and session secrets must be different after trimming', () => {
  assertThrows(() => loadSecurityConfig({ JWT_SECRET: secret, SESSION_SECRET: ` ${secret} ` }), 'must be different');
});

test('committed example leaves sensitive values blank', () => {
  const example = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
  for (const name of ['JWT_SECRET', 'SESSION_SECRET', 'ADMIN_PASSWORD']) {
    const match = example.match(new RegExp(`^${name}=(.*)$`, 'm'));
    assert.ok(match, `${name} assignment is present`);
    assert.equal(match[1], '', `${name} must be blank in the example`);
  }
});

test('unauthenticated admin session is rejected for pages and APIs', () => {
  assert.equal(runAdminMiddleware(undefined).redirectPath, '/admin/login');
  assert.equal(runAdminMiddleware(undefined, '/api/chat/admin/conversations').statusCode, 401);
});

test('authenticated admin session is accepted', () => {
  const result = runAdminMiddleware({ admin: { id: 'admin-id', role: 'admin' } });
  assert.equal(result.nextCalled, true);
});

test('admin session middleware uses persistent session store and secure cookie settings', () => {
  const store = new EventEmitter();
  store.get = () => {};
  store.set = () => {};
  store.destroy = () => {};
  const options = createAdminSessionOptions({ mongoUri: 'mongodb://unused/test', sessionSecret: secret, store });
  assert.equal(options.store, store);
  assert.equal(options.name, 'stars_admin.sid');
  assert.equal(options.resave, false);
  assert.equal(options.saveUninitialized, false);
  assert.equal(options.cookie.httpOnly, true);
  assert.equal(options.cookie.sameSite, 'lax');
  assert.equal(options.cookie.secure, false);

  const productionOptions = createAdminSessionOptions({
    mongoUri: 'mongodb://unused/test',
    sessionSecret: secret,
    store,
    isProduction: true,
  });
  assert.equal(productionOptions.cookie.secure, true);
});

test('connect-mongo v6 CommonJS default export exposes MongoStore.create', () => {
  assert.equal(typeof MongoStore.create, 'function');
});

test('admin session store can share the mongoose client promise instead of opening a second client', () => {
  const clientPromise = new Promise(() => {});
  const options = createAdminSessionOptions({
    sessionSecret: secret,
    clientPromise,
  });

  assert.equal(options.store.clientP, clientPromise);
});

test('Socket.IO Server dependency can construct and close an isolated server', async () => {
  assert.equal(typeof Server, 'function');
  const httpServer = http.createServer();
  const socketServer = new Server(httpServer);
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, () => {
      socketServer.close(() => httpServer.close(resolve));
    });
  });
});

test('admin=true query parameter alone does not authenticate a socket', () => {
  assertThrows(() => authenticateSocket({
    request: {},
    handshake: { query: { admin: 'true' }, auth: {} },
  }, secret), 'Authentication required');
});

test('valid administrator session authenticates an admin socket', () => {
  const identity = authenticateSocket({
    request: { session: { admin: { id: 'admin-id', role: 'admin' } } },
    handshake: { query: { admin: 'true' }, auth: {} },
  }, secret);
  assert.deepEqual(identity, { id: 'admin-id', role: 'admin' });
});

test('customer and provider JWTs authenticate mobile sockets', () => {
  for (const role of ['customer', 'provider']) {
    const token = jwt.sign({ id: `${role}-id`, role }, secret);
    const identity = authenticateSocket({ request: {}, handshake: { auth: { token } } }, secret);
    assert.deepEqual(identity, { id: `${role}-id`, role });
  }
});

test('admin and unknown JWT roles are rejected from mobile sockets', () => {
  for (const role of ['admin', 'unknown']) {
    const token = jwt.sign({ id: `${role}-id`, role }, secret);
    assertThrows(() => authenticateSocket({ request: {}, handshake: { auth: { token } } }, secret), 'Invalid authentication');
  }
});

test('admin password policy rejects the legacy password', () => {
  assert.equal(isValidAdminPassword('admin123'), false);
});

test('admin password policy rejects public and obvious placeholders', () => {
  assert.equal(isValidAdminPassword('do-not-store-a-real-password-here'), false);
  assert.equal(isValidAdminPassword('changeme'), false);
  assert.equal(isValidAdminPassword('change-me'), false);
});

test('admin password policy accepts a strong password', () => {
  assert.equal(isValidAdminPassword('A secure administrator password 2026!'), true);
});