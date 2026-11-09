const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET =
  'stars-forced-password-test-secret-2026-a1b2c3d4';
process.env.SESSION_SECRET =
  'stars-forced-password-session-secret-2026-e5f6g7h8';

const {
  createAuthMiddleware,
} = require('../src/middleware/auth');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

const userId = '64b7c38f3f8b07f0c1234567';
const secret = process.env.JWT_SECRET;

function activeUser(overrides = {}) {
  return {
    _id: {
      toString: () => userId,
    },
    fullName: 'Forced Password User',
    email: 'forced@example.com',
    phoneNumbers: [{ number: '0599000000', primary: true }],
    role: 'customer',
    area: 'Ramallah',
    publicId: 'USR-001',
    status: 'active',
    deleted: false,
    sessionVersion: 0,
    mustChangePassword: true,
    ...overrides,
  };
}

async function runAuth({
  token,
  user,
  method = 'GET',
  baseUrl = '/api/users',
  routePath = '/orders',
}) {
  const req = {
    method,
    baseUrl,
    path: routePath,
    header(name) {
      return name === 'Authorization'
        ? `Bearer ${token}`
        : undefined;
    },
  };
  const res = responseRecorder();
  let nextCalled = false;

  const middleware = createAuthMiddleware({
    jwtSecret: secret,
    UserModel: {
      async findById() {
        return user;
      },
    },
  });

  await middleware(req, res, () => {
    nextCalled = true;
  });

  return { req, res, nextCalled };
}

test('accounts marked for a password change cannot use protected APIs', async () => {
  const token = jwt.sign(
    { id: userId, role: 'customer' },
    secret,
    { expiresIn: '1h' },
  );
  const result = await runAuth({ token, user: activeUser() });

  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 403);
  assert.equal(result.res.body.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('password change and session validation remain reachable while forced', async () => {
  const token = jwt.sign(
    { id: userId, role: 'customer' },
    secret,
    { expiresIn: '1h' },
  );

  const passwordChange = await runAuth({
    token,
    user: activeUser(),
    method: 'PUT',
    baseUrl: '/api/users',
    routePath: '/password',
  });
  assert.equal(passwordChange.nextCalled, true);

  const sessionCheck = await runAuth({
    token,
    user: activeUser(),
    method: 'GET',
    baseUrl: '/api/auth',
    routePath: '/me',
  });
  assert.equal(sessionCheck.nextCalled, true);
});

test('admin password resets and new drivers require a password change', () => {
  const model = source('src/models/User.js');
  assert.match(model, /mustChangePassword:\s*\{\s*type:\s*Boolean/);

  const adminUsers = source('src/routes/adminUsers.js');
  const adminDrivers = source('src/routes/adminDrivers.js');

  assert.match(adminUsers, /mustChangePassword:\s*true/);
  assert.match(adminDrivers, /mustChangePassword:\s*true/);
  assert.match(
    adminDrivers,
    /password:\s*hashedPassword,\s*mustChangePassword:\s*true/s,
  );
});

test('mobile login and session payloads expose the forced-change flag', () => {
  const auth = source('src/routes/auth.js');
  const users = source('src/routes/users.js');

  assert.match(auth, /mustChangePassword:\s*user\.mustChangePassword === true/);
  assert.match(auth, /mustChangePassword:\s*req\.authUser\.mustChangePassword === true/);

  assert.match(
    users,
    /\$set:\s*\{\s*password:\s*hashedPassword,\s*mustChangePassword:\s*false/s,
  );
});

test('socket authentication refuses forced-password sessions', () => {
  const index = source('src/index.js');

  assert.match(
    index,
    /role status deleted sessionVersion mustChangePassword/,
  );
  assert.match(index, /user\.mustChangePassword === true/);
});
