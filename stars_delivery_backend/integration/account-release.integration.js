// A deleted account must not block the same email from registering again.
// Real HTTP (production auth router) + real MongoDB (in-memory).
const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

// Synthetic, test-only process configuration.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'stars-integration-jwt-secret-2026-04-d';
process.env.SESSION_SECRET = 'stars-integration-session-secret-2026-05-e';
process.env.PASSWORD_RECOVERY_SECRET = 'stars-integration-recovery-secret-2026-06-f';

const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server-core');

const authRoutes = require('../src/routes/auth');
const User = require('../src/models/User');
const PendingProvider = require('../src/models/PendingProvider');
const PushToken = require('../src/models/PushToken');
const {
  releaseDeletedAccountIdentity,
  isReleasedEmail,
} = require('../src/services/accountRelease');

const PASSWORD = 'Cedar!River2026#Strong';
let mongoServer;
let app;

function registration(role, email) {
  return {
    fullName: role === 'provider' ? 'Returning Driver' : 'Returning Customer',
    email,
    phone: '0599000077',
    password: PASSWORD,
    role,
    area: 'Al-Bireh',
    governorate: 'رام الله والبيرة',
    privacyPolicy: true,
    serviceTypes: role === 'provider' ? ['product'] : [],
  };
}

// What the admin "delete permanently" action does to the account document.
async function adminSoftDelete(email) {
  const user = await User.findOne({ email });
  await User.updateOne(
    { _id: user._id },
    { $set: { deleted: true, status: 'blocked' }, $inc: { sessionVersion: 1 } },
  );
  return User.findById(user._id);
}

before(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: {
      version: '8.2.6',
      downloadDir: path.join(os.tmpdir(), 'stars-delivery-mongodb-binaries'),
    },
  });
  await mongoose.connect(mongoServer.getUri('stars_account_release'));
  app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
});

afterEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    PendingProvider.deleteMany({}),
    PushToken.deleteMany({}),
  ]);
});

after(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

// The registration endpoint is rate limited per IP, so tests that do not
// exercise registration itself create accounts directly.
test('admin delete releases the email and ID, keeping them for audit', async () => {
  await User.create({
    fullName: 'Old Customer',
    email: 'again@example.test',
    password: 'x',
    role: 'customer',
    publicId: '900000000001',
  });
  const deleted = await adminSoftDelete('again@example.test');
  await PushToken.create({ userId: deleted._id, token: 'tok-1', platform: 'android' });

  assert.equal(await releaseDeletedAccountIdentity(deleted), true);

  const released = await User.findById(deleted._id).lean();
  assert.ok(isReleasedEmail(released.email));
  assert.equal(released.deletedEmail, 'again@example.test');
  assert.equal(released.deletedPublicId, deleted.publicId);
  assert.equal(released.publicId, undefined);
  assert.equal(await PushToken.countDocuments({ userId: deleted._id }), 0);
  // Released accounts are left alone the second time.
  assert.equal(await releaseDeletedAccountIdentity(released), false);
});

test('the same email registers again after the account was deleted', async () => {
  await request(app)
    .post('/api/auth/register')
    .send(registration('customer', 'reuse@example.test'))
    .expect(201);
  await adminSoftDelete('reuse@example.test');

  // A previously deleted account (deleted before this fix, never released)
  // no longer blocks the email: registration releases it on the fly.
  const again = await request(app)
    .post('/api/auth/register')
    .send(registration('customer', 'reuse@example.test'))
    .expect(201);
  assert.equal(again.body.user.email, 'reuse@example.test');

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'reuse@example.test', password: PASSWORD, role: 'customer' })
    .expect(200);
  assert.equal(login.body.user.id, again.body.user.id);
  assert.equal(await User.countDocuments({ deletedEmail: 'reuse@example.test' }), 1);
});

test('a deleted driver can apply again with the same email', async () => {
  // Approved driver account, then deleted by the admin.
  await User.create({
    fullName: 'Old Driver',
    email: 'driver-again@example.test',
    password: 'x',
    role: 'provider',
    area: 'Al-Bireh',
    status: 'active',
  });
  await adminSoftDelete('driver-again@example.test');

  const res = await request(app)
    .post('/api/auth/register')
    .send(registration('provider', 'driver-again@example.test'))
    .expect(201);
  assert.equal(res.body.pending, true);
  assert.equal(await PendingProvider.countDocuments({ email: 'driver-again@example.test' }), 1);
});

test('an active account still blocks its email', async () => {
  await User.create({
    fullName: 'Active Customer',
    email: 'taken@example.test',
    password: 'x',
    role: 'customer',
  });
  const res = await request(app)
    .post('/api/auth/register')
    .send(registration('customer', 'taken@example.test'))
    .expect(400);
  assert.equal(res.body.error, 'Email already registered');
});
