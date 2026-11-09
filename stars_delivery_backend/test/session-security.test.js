const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const jwt = require('jsonwebtoken');

// auth.js loads security configuration at module import time.
process.env.JWT_SECRET =
  'stars-session-test-jwt-secret-2026-a1b2c3d4';
process.env.SESSION_SECRET =
  'stars-session-test-session-secret-2026-e5f6g7h8';

const {
  isActiveMobileAccount,
  publicMobileUser,
} = require('../src/services/mobileSession');

const {
  createAuthMiddleware,
} = require('../src/middleware/auth');

const authenticateSocket =
  require('../src/socket/authenticateSocket');

const backendRoot =
  path.resolve(__dirname, '..');

const projectRoot =
  path.resolve(backendRoot, '..');

const secret =
  process.env.JWT_SECRET;

const userId =
  '64b7c38f3f8b07f0c1234567';

function source(relativePath) {
  return fs.readFileSync(
    path.join(
      projectRoot,
      relativePath,
    ),
    'utf8',
  );
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

function activeUser(overrides = {}) {
  return {
    _id: {
      toString: () => userId,
    },
    fullName: 'Session User',
    email: 'session@example.com',
    phoneNumbers: [
      {
        number: '0599000000',
        primary: true,
      },
    ],
    role: 'customer',
    area: 'Ramallah',
    publicId: 'USR-001',
    status: 'active',
    deleted: false,
    ...overrides,
  };
}

async function runAuth({
  token,
  user,
}) {
  const req = {
    header(name) {
      if (name !== 'Authorization') {
        return undefined;
      }

      return token
        ? `Bearer ${token}`
        : undefined;
    },
  };

  const res = responseRecorder();

  let nextCalled = false;
  let nextError = null;

  const middleware =
    createAuthMiddleware({
      jwtSecret: secret,
      UserModel: {
        async findById() {
          return user;
        },
      },
    });

  await middleware(
    req,
    res,
    (error) => {
      nextCalled = true;
      nextError = error || null;
    },
  );

  return {
    req,
    res,
    nextCalled,
    nextError,
  };
}

test(
  'active customer and provider accounts are session eligible',
  () => {
    for (const role of [
      'customer',
      'provider',
    ]) {
      assert.equal(
        isActiveMobileAccount({
          role,
          status: 'active',
          deleted: false,
        }),
        true,
      );
    }
  },
);

test(
  'blocked inactive pending and deleted accounts are rejected',
  () => {
    for (const status of [
      'blocked',
      'inactive',
      'pending',
    ]) {
      assert.equal(
        isActiveMobileAccount({
          role: 'customer',
          status,
          deleted: false,
        }),
        false,
      );
    }

    assert.equal(
      isActiveMobileAccount({
        role: 'provider',
        status: 'active',
        deleted: true,
      }),
      false,
    );
  },
);

test(
  'blockedUntil is operational order state not session revocation',
  () => {
    assert.equal(
      isActiveMobileAccount({
        role: 'provider',
        status: 'active',
        deleted: false,
        blockedUntil:
          new Date(
            Date.now() + 60_000,
          ),
      }),
      true,
    );
  },
);

test(
  'publicMobileUser exposes only mobile profile fields',
  () => {
    const payload =
      publicMobileUser({
        _id: {
          toString: () => userId,
        },
        fullName: 'Test User',
        email: 'user@example.com',
        password: 'hashed-secret',
        role: 'customer',
        area: 'Ramallah',
        governorate: 'رام الله والبيرة',
        publicId: 'USR-001',
        status: 'active',
        deleted: false,
        phoneNumbers: [
          {
            number: '111',
            primary: false,
          },
          {
            number: '222',
            primary: true,
          },
        ],
      });

    assert.deepEqual(
      payload,
      {
        id: userId,
        fullName: 'Test User',
        email: 'user@example.com',
        phone: '222',
        role: 'customer',
        area: 'Ramallah',
        governorate: 'رام الله والبيرة',
        publicId: 'USR-001',
      },
    );

    assert.equal(
      Object.hasOwn(
        payload,
        'password',
      ),
      false,
    );

    assert.equal(
      Object.hasOwn(
        payload,
        'status',
      ),
      false,
    );

    assert.equal(
      Object.hasOwn(
        payload,
        'deleted',
      ),
      false,
    );
  },
);

test(
  'REST session accepts valid JWT only when current account is active',
  async () => {
    const token = jwt.sign(
      {
        id: userId,
        role: 'customer',
      },
      secret,
      {
        expiresIn: '1h',
      },
    );

    const result =
      await runAuth({
        token,
        user: activeUser(),
      });

    assert.equal(
      result.nextCalled,
      true,
    );

    assert.equal(
      result.nextError,
      null,
    );

    assert.equal(
      result.req.userId,
      userId,
    );

    assert.equal(
      result.req.userRole,
      'customer',
    );

    assert.equal(
      result.req.authUser.role,
      'customer',
    );
  },
);

test(
  'REST session rejects blocked and deleted database accounts',
  async () => {
    for (const user of [
      activeUser({
        status: 'blocked',
      }),
      activeUser({
        deleted: true,
      }),
    ]) {
      const token = jwt.sign(
        {
          id: userId,
          role: 'customer',
        },
        secret,
        {
          expiresIn: '1h',
        },
      );

      const result =
        await runAuth({
          token,
          user,
        });

      assert.equal(
        result.res.statusCode,
        403,
      );

      assert.deepEqual(
        result.res.body,
        {
          error:
            'Account is not active',
          code:
            'ACCOUNT_INACTIVE',
        },
      );

      assert.equal(
        result.nextCalled,
        false,
      );
    }
  },
);

test(
  'REST session rejects deleted database identity even with a valid signed JWT',
  async () => {
    const token = jwt.sign(
      {
        id: userId,
        role: 'customer',
      },
      secret,
      {
        expiresIn: '1h',
      },
    );

    const result =
      await runAuth({
        token,
        user: null,
      });

    assert.equal(
      result.res.statusCode,
      401,
    );

    assert.equal(
      result.res.body.code,
      'SESSION_INVALID',
    );

    assert.equal(
      result.nextCalled,
      false,
    );
  },
);

test(
  'REST session distinguishes expired token',
  async () => {
    const token = jwt.sign(
      {
        id: userId,
        role: 'customer',
      },
      secret,
      {
        expiresIn: -1,
      },
    );

    const result =
      await runAuth({
        token,
        user: activeUser(),
      });

    assert.equal(
      result.res.statusCode,
      401,
    );

    assert.equal(
      result.res.body.code,
      'TOKEN_EXPIRED',
    );

    assert.equal(
      result.nextCalled,
      false,
    );
  },
);

test(
  'REST session rejects role mismatch against current database account',
  async () => {
    const token = jwt.sign(
      {
        id: userId,
        role: 'customer',
      },
      secret,
      {
        expiresIn: '1h',
      },
    );

    const result =
      await runAuth({
        token,
        user: activeUser({
          role: 'provider',
        }),
      });

    assert.equal(
      result.res.statusCode,
      401,
    );

    assert.equal(
      result.res.body.code,
      'SESSION_INVALID',
    );

    assert.equal(
      result.nextCalled,
      false,
    );
  },
);

test(
  'auth router exposes authoritative me endpoint',
  () => {
    const authSource =
      source(
        'stars_delivery_backend/src/routes/auth.js',
      );

    assert.match(
      authSource,
      /router\.get\(\s*'\/me'/,
    );

    assert.match(
      authSource,
      /publicMobileUser\(\s*req\.authUser/,
    );
  },
);

test(
  'login verifies password before revealing account state',
  () => {
    const authSource =
      source(
        'stars_delivery_backend/src/routes/auth.js',
      );

    const passwordPosition =
      authSource.indexOf(
        'bcrypt.compare(',
      );

    const statePosition =
      authSource.indexOf(
        'if (!isActiveMobileAccount(user, role))',
      );

    const tokenPosition =
      authSource.indexOf(
        'const token = jwt.sign',
        passwordPosition,
      );

    assert.notEqual(
      passwordPosition,
      -1,
    );

    assert.notEqual(
      statePosition,
      -1,
    );

    assert.notEqual(
      tokenPosition,
      -1,
    );

    assert.ok(
      passwordPosition < statePosition,
    );

    assert.ok(
      statePosition < tokenPosition,
    );
  },
);

test(
  'Socket identity preserves expiry metadata for expiring JWT',
  () => {
    const token = jwt.sign(
      {
        id: userId,
        role: 'provider',
      },
      secret,
      {
        expiresIn: '1h',
      },
    );

    const identity =
      authenticateSocket(
        {
          request: {},
          handshake: {
            auth: {
              token,
            },
          },
        },
        secret,
      );

    assert.equal(
      identity.id,
      userId,
    );

    assert.equal(
      identity.role,
      'provider',
    );

    assert.equal(
      typeof identity.expiresAt,
      'number',
    );

    assert.ok(
      identity.expiresAt
      > Date.now(),
    );
  },
);

test(
  'Socket server revalidates current account and schedules JWT expiry disconnect',
  () => {
    const indexSource =
      source(
        'stars_delivery_backend/src/index.js',
      );

    assert.match(
      indexSource,
      /io\.use\(async \(socket, next\)/,
    );

    assert.match(
      indexSource,
      /await User\.findById\(/,
    );

    assert.match(
      indexSource,
      /isActiveMobileAccount\(/,
    );

    assert.match(
      indexSource,
      /sessionExpiryTimer/,
    );

    assert.match(
      indexSource,
      /socket\.disconnect\(true\)/,
    );
  },
);

test(
  'admin blocking disconnects active customer and provider sockets',
  () => {
    const customerSource =
      source(
        'stars_delivery_backend/src/routes/adminUsers.js',
      );

    const providerSource =
      source(
        'stars_delivery_backend/src/routes/adminDrivers.js',
      );

    assert.match(
      customerSource,
      /disconnectSockets\(true\)/,
    );

    assert.match(
      providerSource,
      /disconnectSockets\(true\)/,
    );
  },
);
