const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET ||=
  'stars-016-jwt-secret-2026-aaaaaaaaaaaa';
process.env.SESSION_SECRET ||=
  'stars-016-session-secret-2026-bbbbbbbbb';

const {
  mobileSessionVersion,
  tokenMobileSessionVersion,
  mobileSessionVersionMatches,
  mobileSessionRotationFilter,
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
  '507f1f77bcf86cd799439011';

function backendSource(relativePath) {
  return fs.readFileSync(
    path.join(
      backendRoot,
      relativePath,
    ),
    'utf8',
  );
}

function projectSource(relativePath) {
  return fs.readFileSync(
    path.join(
      projectRoot,
      relativePath,
    ),
    'utf8',
  );
}

function activeUser({
  sessionVersion,
  role = 'customer',
} = {}) {
  return {
    _id: {
      toString: () => userId,
    },
    fullName: 'Session User',
    email: 'session@example.com',
    phoneNumbers: [],
    role,
    area: '',
    publicId: 'session-user',
    status: 'active',
    deleted: false,
    ...(sessionVersion === undefined
      ? {}
      : { sessionVersion }),
  };
}

async function runRestAuth({
  token,
  user,
}) {
  const middleware =
    createAuthMiddleware({
      UserModel: {
        findById: async () => user,
      },
      jwtSecret: secret,
    });

  let statusCode = 200;
  let body;
  let nextCalled = false;
  let nextError;

  const req = {
    header(name) {
      return name.toLowerCase()
        === 'authorization'
          ? `Bearer ${token}`
          : '';
    },
  };

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },

    json(payload) {
      body = payload;
      return this;
    },
  };

  await middleware(
    req,
    res,
    (error) => {
      nextError = error;
      nextCalled = !error;
    },
  );

  if (nextError) {
    throw nextError;
  }

  return {
    statusCode,
    body,
    nextCalled,
  };
}

test(
  'generation normalization preserves legacy v0 and rejects malformed values',
  () => {
    assert.equal(
      mobileSessionVersion({}),
      0,
    );

    assert.equal(
      tokenMobileSessionVersion(undefined),
      0,
    );

    assert.equal(
      mobileSessionVersion({
        sessionVersion: 4,
      }),
      4,
    );

    for (
      const malformed
      of [null, '1', -1, 1.5]
    ) {
      assert.equal(
        mobileSessionVersion({
          sessionVersion: malformed,
        }),
        null,
      );

      assert.equal(
        tokenMobileSessionVersion(
          malformed,
        ),
        null,
      );
    }

    assert.equal(
      mobileSessionVersionMatches(
        {},
        undefined,
      ),
      true,
    );

    assert.equal(
      mobileSessionVersionMatches(
        {
          sessionVersion: 1,
        },
        undefined,
      ),
      false,
    );
  },
);

test(
  'rotation filter supports legacy documents and optimistic concurrency',
  () => {
    assert.deepEqual(
      mobileSessionRotationFilter({}),
      {
        $or: [
          {
            sessionVersion: 0,
          },
          {
            sessionVersion: {
              $exists: false,
            },
          },
        ],
      },
    );

    assert.deepEqual(
      mobileSessionRotationFilter({
        sessionVersion: 5,
      }),
      {
        sessionVersion: 5,
      },
    );

    assert.equal(
      mobileSessionRotationFilter({
        sessionVersion:
          Number.MAX_SAFE_INTEGER,
      }),
      null,
    );
  },
);

test(
  'historical JWT becomes invalid after account generation rotates',
  async () => {
    const token =
      jwt.sign(
        {
          id: userId,
          role: 'customer',
        },
        secret,
        {
          expiresIn: '1h',
        },
      );

    assert.equal(
      (
        await runRestAuth({
          token,
          user: activeUser(),
        })
      ).nextCalled,
      true,
    );

    const rejected =
      await runRestAuth({
        token,
        user: activeUser({
          sessionVersion: 1,
        }),
      });

    assert.equal(
      rejected.statusCode,
      401,
    );

    assert.equal(
      rejected.body?.code,
      'SESSION_INVALID',
    );
  },
);

test(
  'REST accepts current generation and rejects stale or malformed claims',
  async () => {
    const current =
      jwt.sign(
        {
          id: userId,
          role: 'customer',
          sessionVersion: 2,
        },
        secret,
        {
          expiresIn: '1h',
        },
      );

    assert.equal(
      (
        await runRestAuth({
          token: current,
          user: activeUser({
            sessionVersion: 2,
          }),
        })
      ).nextCalled,
      true,
    );

    for (
      const version
      of [1, '2', null]
    ) {
      const token =
        jwt.sign(
          {
            id: userId,
            role: 'customer',
            sessionVersion: version,
          },
          secret,
          {
            expiresIn: '1h',
          },
        );

      const rejected =
        await runRestAuth({
          token,
          user: activeUser({
            sessionVersion: 2,
          }),
        });

      assert.equal(
        rejected.statusCode,
        401,
      );

      assert.equal(
        rejected.body?.code,
        'SESSION_INVALID',
      );
    }
  },
);

test(
  'registration and login issue generation-bound JWTs without enforcing new policy at login',
  () => {
    const source =
      backendSource(
        'src/routes/auth.js',
      );

    assert.equal(
      (
        source.match(
          /const sessionVersion\s*=/g,
        ) || []
      ).length,
      2,
    );

    assert.equal(
      (
        source.match(
          /mobileSessionVersion\(user\)/g,
        ) || []
      ).length,
      2,
    );

    const loginStart =
      source.indexOf(
        "router.post('/login'",
      );

    const loginEnd =
      source.indexOf(
        "router.get(",
        loginStart,
      );

    const login =
      source.slice(
        loginStart,
        loginEnd,
      );

    assert.doesNotMatch(
      login,
      /isValidMobilePassword\(password\)/,
    );
  },
);

test(
  'Socket JWT authentication supports legacy tokens and rejects malformed generations',
  () => {
    const legacy =
      jwt.sign(
        {
          id: 'socket-user',
          role: 'customer',
        },
        secret,
      );

    assert.deepEqual(
      authenticateSocket(
        {
          request: {},
          handshake: {
            auth: {
              token: legacy,
            },
          },
        },
        secret,
      ),
      {
        id: 'socket-user',
        role: 'customer',
      },
    );

    const versioned =
      jwt.sign(
        {
          id: 'socket-user',
          role: 'customer',
          sessionVersion: 3,
        },
        secret,
      );

    assert.deepEqual(
      authenticateSocket(
        {
          request: {},
          handshake: {
            auth: {
              token: versioned,
            },
          },
        },
        secret,
      ),
      {
        id: 'socket-user',
        role: 'customer',
        sessionVersion: 3,
      },
    );

    for (
      const version
      of [null, '3', -1, 1.5]
    ) {
      const token =
        jwt.sign(
          {
            id: 'socket-user',
            role: 'customer',
            sessionVersion: version,
          },
          secret,
        );

      assert.throws(
        () =>
          authenticateSocket(
            {
              request: {},
              handshake: {
                auth: { token },
              },
            },
            secret,
          ),
        /Invalid authentication/,
      );
    }
  },
);

test(
  'Socket persisted-account middleware validates generation before account activity',
  () => {
    const source =
      backendSource(
        'src/index.js',
      );

    assert.match(
      source,
      /role status deleted sessionVersion/,
    );

    const versionCheck =
      source.indexOf(
        'mobileSessionVersionMatches(',
      );

    const activityCheck =
      source.indexOf(
        'isActiveMobileAccount(',
        versionCheck,
      );

    assert.ok(
      versionCheck >= 0,
    );

    assert.ok(
      activityCheck > versionCheck,
    );
  },
);

test(
  'all credential mutation paths use atomic version increment and socket disconnection',
  () => {
    const users =
      backendSource(
        'src/routes/users.js',
      );

    const adminUsers =
      backendSource(
        'src/routes/adminUsers.js',
      );

    const adminDrivers =
      backendSource(
        'src/routes/adminDrivers.js',
      );

    const regions = [
      users.slice(
        users.indexOf(
          "router.put('/password'",
        ),
        users.indexOf(
          "router.put('/profile'",
        ),
      ),

      adminUsers.slice(
        adminUsers.indexOf(
          "router.put('/:id/password'",
        ),
        adminUsers.indexOf(
          "router.delete('/:id'",
        ),
      ),

      adminDrivers.slice(
        adminDrivers.indexOf(
          "router.put('/:id/password'",
        ),
        adminDrivers.indexOf(
          "router.delete('/:id'",
        ),
      ),
    ];

    for (const region of regions) {
      assert.match(
        region,
        /mobileSessionRotationFilter\(/,
      );

      assert.match(
        region,
        /\$inc:\s*\{\s*sessionVersion:\s*1/,
      );

      assert.match(
        region,
        /rotation\.matchedCount !== 1/,
      );

      assert.match(
        region,
        /disconnectSockets\(true\)/,
      );
    }

    assert.match(
      regions[0],
      /bcrypt\.compare\(\s*currentPassword,\s*user\.password/,
    );

    assert.doesNotMatch(
      regions[0],
      /jwt\.sign/,
    );
  },
);

test(
  'Flutter logout integration and post-password-request mounted guard are preserved',
  () => {
    const socketService =
      projectSource(
        'lib/services/socket_service.dart',
      );

    const customer =
      projectSource(
        'lib/screens/home_screen.dart',
      );

    const provider =
      projectSource(
        'lib/screens/provider_home_screen.dart',
      );

    const profile =
      projectSource(
        'lib/screens/profile_screen.dart',
      );

    assert.match(
      socketService,
      /reason == 'io server disconnect'/,
    );

    for (
      const source
      of [customer, provider]
    ) {
      assert.match(
        source,
        /onSessionRevoked\.listen/,
      );

      assert.match(
        source,
        /LogoutEvent\(\)/,
      );

      assert.match(
        source,
        /Navigator\.pushAndRemoveUntil/,
      );
    }

    const method =
      profile.slice(
        profile.indexOf(
          'Future<void> _changePassword()',
        ),
        profile.indexOf(
          'Dio _client()',
        ),
      );

    // Formatting-tolerant: dart format may wrap the call across lines.
    const request =
      method.search(
        /await dio\.put\(\s*'\/users\/password'/,
      );

    const guard =
      method.indexOf(
        'if (!mounted) return;',
        request,
      );

    const clear =
      method.indexOf(
        '_currentPassCtrl.clear();',
        request,
      );

    assert.ok(request >= 0);
    assert.ok(guard > request);
    assert.ok(clear > guard);
  },
);
