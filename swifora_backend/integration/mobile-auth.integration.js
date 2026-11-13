const {
  after,
  afterEach,
  before,
  test,
} = require('node:test');

const assert =
  require('node:assert/strict');

const os =
  require('node:os');

const path =
  require('node:path');

//
// Integration-only process configuration.
//
// These values are deliberately synthetic and never leave
// this local/CI test process.
//
process.env.NODE_ENV = 'test';

process.env.JWT_SECRET =
  'stars-integration-jwt-secret-2026-01-a';

process.env.SESSION_SECRET =
  'stars-integration-session-secret-2026-02-b';

process.env.PASSWORD_RECOVERY_SECRET =
  'stars-integration-recovery-secret-2026-03-c';

const express =
  require('express');

const bcrypt =
  require('bcryptjs');

const mongoose =
  require('mongoose');

const request =
  require('supertest');

const {
  MongoMemoryServer,
} = require(
  'mongodb-memory-server-core',
);

//
// Import the actual production router and models.
//
// This is intentionally a router-level HTTP integration
// slice. It does not import src/index.js because index.js
// currently owns process startup, Mongo connection, and
// Socket.IO lifecycle as one bootstrap boundary.
//
const authRoutes =
  require('../src/routes/auth');

const User =
  require('../src/models/User');

const PendingProvider =
  require('../src/models/PendingProvider');

const STRONG_PASSWORD =
  'Cedar!River2026#Strong';

const LEGACY_SHORT_PASSWORD =
  'Old7!Pwd';

let mongoServer;
let app;

function customerPayload({
  email,
  password = STRONG_PASSWORD,
  phone = '0599000001',
} = {}) {
  return {
    fullName:
      'Integration Customer',
    email,
    phone,
    password,
    role:
      'customer',
    area:
      'Ramallah',
    privacyPolicy:
      true,
  };
}

before(async () => {
  mongoServer =
    await MongoMemoryServer.create({
      binary: {
        version:
          '8.2.6',

        // Keep downloaded test binaries outside the
        // repository so they can never enter Git scope.
        downloadDir:
          path.join(
            os.tmpdir(),
            'swifora-mongodb-binaries',
          ),
      },

      instance: {
        dbName:
          'stars_delivery_integration',
      },
    });

  await mongoose.connect(
    mongoServer.getUri(),
  );

  app =
    express();

  app.use(
    express.json(),
  );

  app.use(
    '/api/auth',
    authRoutes,
  );
});

afterEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    PendingProvider.deleteMany({}),
  ]);
});

after(async () => {
  if (
    mongoose.connection.readyState !== 0
  ) {
    await mongoose.disconnect();
  }

  if (mongoServer) {
    await mongoServer.stop();
  }
});

test(
  'customer registration persists normalized credentials then login and me cross the real HTTP and Mongo boundaries',
  async () => {
    const registration =
      await request(app)
        .post('/api/auth/register')
        .send(
          customerPayload({
            email:
              '  AUTH.Flow@Example.com  ',
          }),
        )
        .expect(201);

    assert.equal(
      typeof registration.body.token,
      'string',
    );

    assert.equal(
      registration.body.user.email,
      'auth.flow@example.com',
    );

    assert.equal(
      registration.body.user.role,
      'customer',
    );

    const persisted =
      await User
        .findOne({
          email:
            'auth.flow@example.com',
        })
        .select('+password');

    assert.ok(persisted);

    assert.notEqual(
      persisted.password,
      STRONG_PASSWORD,
    );

    assert.equal(
      await bcrypt.compare(
        STRONG_PASSWORD,
        persisted.password,
      ),
      true,
    );

    const login =
      await request(app)
        .post('/api/auth/login')
        .send({
          email:
            'AUTH.FLOW@example.com',
          password:
            STRONG_PASSWORD,
          role:
            'customer',
        })
        .expect(200);

    assert.equal(
      typeof login.body.token,
      'string',
    );

    assert.equal(
      login.body.user.email,
      'auth.flow@example.com',
    );

    const me =
      await request(app)
        .get('/api/auth/me')
        .set(
          'Authorization',
          `Bearer ${login.body.token}`,
        )
        .expect(200);

    assert.equal(
      me.body.user.email,
      'auth.flow@example.com',
    );

    assert.equal(
      me.body.user.role,
      'customer',
    );

    assert.equal(
      me.body.user.id,
      persisted._id.toString(),
    );
  },
);

test(
  'normalized duplicate customer registration is rejected against real persisted identity state',
  async () => {
    await request(app)
      .post('/api/auth/register')
      .send(
        customerPayload({
          email:
            'duplicate@example.com',
          phone:
            '0599000002',
        }),
      )
      .expect(201);

    const duplicate =
      await request(app)
        .post('/api/auth/register')
        .send(
          customerPayload({
            email:
              ' DUPLICATE@EXAMPLE.COM ',
            phone:
              '0599000003',
          }),
        )
        .expect(400);

    assert.equal(
      duplicate.body.error,
      'Email already registered',
    );

    assert.equal(
      await User.countDocuments({
        email:
          'duplicate@example.com',
      }),
      1,
    );
  },
);

test(
  'new customer registration rejects a short password through the actual HTTP policy boundary',
  async () => {
    const response =
      await request(app)
        .post('/api/auth/register')
        .send(
          customerPayload({
            email:
              'short-policy@example.com',
            phone:
              '0599000004',
            password:
              LEGACY_SHORT_PASSWORD,
          }),
        )
        .expect(400);

    assert.equal(
      response.body.code,
      'PASSWORD_POLICY',
    );

    assert.equal(
      await User.countDocuments({
        email:
          'short-policy@example.com',
      }),
      0,
    );
  },
);

test(
  'historical short-password customer still logs in through the actual endpoint',
  async () => {
    assert.ok(
      LEGACY_SHORT_PASSWORD.length < 12,
    );

    const legacyHash =
      await bcrypt.hash(
        LEGACY_SHORT_PASSWORD,
        10,
      );

    const legacy =
      await User.create({
        fullName:
          'Historical Customer',

        email:
          'legacy-short@example.com',

        password:
          legacyHash,

        role:
          'customer',

        area:
          'Ramallah',

        publicId:
          '482731',

        phoneNumbers: [
          {
            number:
              '0599000005',
            primary:
              true,
          },
        ],

        privacyPolicy:
          true,

        status:
          'active',

        sessionVersion:
          0,
      });

    const login =
      await request(app)
        .post('/api/auth/login')
        .send({
          email:
            ' LEGACY-SHORT@EXAMPLE.COM ',
          password:
            LEGACY_SHORT_PASSWORD,
          role:
            'customer',
        })
        .expect(200);

    assert.equal(
      login.body.user.id,
      legacy._id.toString(),
    );

    assert.equal(
      login.body.user.email,
      'legacy-short@example.com',
    );

    assert.equal(
      typeof login.body.token,
      'string',
    );

    const me =
      await request(app)
        .get('/api/auth/me')
        .set(
          'Authorization',
          `Bearer ${login.body.token}`,
        )
        .expect(200);

    assert.equal(
      me.body.user.id,
      legacy._id.toString(),
    );
  },
);
