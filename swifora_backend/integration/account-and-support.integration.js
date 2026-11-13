// Real HTTP (production routers) + real MongoDB (in-memory) checks for:
// minimum offer price, signing in while a driver sign-up is pending, editing
// a phone number, permanent account deletion, drivers rating customers,
// two-way guest support and the platform commission report.
const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

// Synthetic, test-only process configuration.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'swifora-integration-jwt-secret-2026-11-a';
process.env.SESSION_SECRET = 'swifora-integration-session-secret-2026-11-b';
process.env.PASSWORD_RECOVERY_SECRET = 'swifora-integration-recovery-secret-2026-11-c';

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server-core');

const User = require('../src/models/User');
const Order = require('../src/models/Order');
const Offer = require('../src/models/Offer');
const PendingProvider = require('../src/models/PendingProvider');
const PushToken = require('../src/models/PushToken');
const Notification = require('../src/models/Notification');
const CustomerRating = require('../src/models/CustomerRating');
const ContactRequest = require('../src/models/ContactRequest');
const {
  permanentlyDeleteAccount,
  AccountDeletionBlockedError,
} = require('../src/services/accountDeletion');
const { customerRatingSummaries } = require('../src/services/customerRatings');
const { commissionReport, reportPeriod } = require('../src/services/commissionReport');

const PASSWORD = 'Cedar!River2026#Strong';
let mongoServer;
let app;

before(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: {
      version: '8.2.6',
      downloadDir: path.join(os.tmpdir(), 'swifora-mongodb-binaries'),
    },
  });
  await mongoose.connect(mongoServer.getUri('swifora_account_support'));
  app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/auth'));
  app.use('/api/users', require('../src/routes/users'));
  app.use('/api/offers', require('../src/routes/offers'));
  app.use('/api/orders', require('../src/routes/orders'));
  app.use('/api/chat', require('../src/routes/chat'));
});

afterEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Order.deleteMany({}),
    Offer.deleteMany({}),
    PendingProvider.deleteMany({}),
    PushToken.deleteMany({}),
    Notification.deleteMany({}),
    CustomerRating.deleteMany({}),
    ContactRequest.deleteMany({}),
  ]);
});

after(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

let seq = 0;
async function account(role, extra = {}) {
  seq += 1;
  const email = `${role}${seq}@example.test`;
  const user = await User.create({
    fullName: `${role} ${seq}`,
    email,
    password: await bcrypt.hash(PASSWORD, 4),
    role,
    status: 'active',
    area: 'Al-Bireh',
    governorate: 'رام الله والبيرة',
    publicId: String(100000 + seq),
    phoneNumbers: [{ number: `059000${String(seq).padStart(4, '0')}`, primary: true }],
    ...extra,
  });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email, password: PASSWORD, role });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { user, token: login.body.token, email };
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

test('offers below 9 shekels are refused', async () => {
  const driver = await account('provider');
  const response = await request(app)
    .post('/api/offers')
    .set(bearer(driver.token))
    .send({ orderId: new mongoose.Types.ObjectId().toString(), price: 8.5, estimatedTime: 10 });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'OFFER_PRICE_TOO_LOW');
  assert.equal(response.body.minPrice, 9);
});

test('a pending driver signing in gets "under review", not "invalid credentials"', async () => {
  const signUp = await request(app).post('/api/auth/register').send({
    fullName: 'Waiting Driver',
    email: 'waiting@example.test',
    phone: '0599111222',
    password: PASSWORD,
    role: 'provider',
    area: 'Al-Bireh',
    governorate: 'رام الله والبيرة',
    serviceTypes: ['product'],
  });
  assert.equal(signUp.status, 201);
  assert.equal(signUp.body.pending, true);

  const pending = await request(app)
    .post('/api/auth/login')
    .send({ email: 'waiting@example.test', password: PASSWORD, role: 'provider' });
  // 200 so retries never count towards the failed-login lockout.
  assert.equal(pending.status, 200);
  assert.equal(pending.body.pending, true);
  assert.equal(pending.body.code, 'ACCOUNT_PENDING_APPROVAL');
  assert.equal(pending.body.token, undefined);

  const wrongPassword = await request(app)
    .post('/api/auth/login')
    .send({ email: 'waiting@example.test', password: 'Wrong!Password2026#', role: 'provider' });
  assert.equal(wrongPassword.status, 400);
  assert.equal(wrongPassword.body.code, 'INVALID_CREDENTIALS');
  assert.equal(wrongPassword.body.pending, undefined);
});

test('a phone number can be changed in place and stays primary', async () => {
  const customer = await account('customer');
  const oldNumber = customer.user.phoneNumbers[0].number;
  await request(app).post('/api/users/phones').set(bearer(customer.token)).send({ number: '0598777666' }).expect(200);

  const changed = await request(app)
    .put('/api/users/phones')
    .set(bearer(customer.token))
    .send({ number: oldNumber, newNumber: '059 123-4567' });
  assert.equal(changed.status, 200);
  assert.deepEqual(
    changed.body.phones.map(({ number, primary }) => ({ number, primary })),
    [{ number: '0591234567', primary: true }, { number: '0598777666', primary: false }],
  );

  const duplicate = await request(app)
    .put('/api/users/phones')
    .set(bearer(customer.token))
    .send({ number: '0591234567', newNumber: '0598777666' });
  assert.equal(duplicate.status, 409);

  const invalid = await request(app)
    .put('/api/users/phones')
    .set(bearer(customer.token))
    .send({ number: '0591234567', newNumber: 'not-a-phone' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, 'INVALID_PHONE');
});

test('permanent delete removes the account so the email can register again', async () => {
  const customer = await account('customer');
  await PushToken.create({ userId: customer.user._id, token: 'device-token-1', platform: 'android' });
  await Notification.create({ userId: customer.user._id, type: 'broadcast', title: 't', body: 'b' });
  const open = await Order.create({
    customerId: customer.user._id, type: 'product', description: 'open', phone: '0599', area: 'Al-Bireh', status: 'pending',
  });
  const done = await Order.create({
    customerId: customer.user._id, type: 'product', description: 'done', phone: '0599', area: 'Al-Bireh', status: 'completed',
  });

  const summary = await permanentlyDeleteAccount(await User.findById(customer.user._id));
  assert.equal(summary.cancelledOrders, 1);
  assert.equal(await User.countDocuments({ _id: customer.user._id }), 0);
  assert.equal(await PushToken.countDocuments({ userId: customer.user._id }), 0);
  assert.equal(await Notification.countDocuments({ userId: customer.user._id }), 0);
  assert.equal((await Order.findById(open._id)).status, 'cancelled');
  // Business records stay.
  assert.equal((await Order.findById(done._id)).status, 'completed');

  // The old session no longer works.
  await request(app).get('/api/users/phones').set(bearer(customer.token)).expect(401);

  // Same email registers again.
  const again = await request(app).post('/api/auth/register').send({
    fullName: 'Back Again',
    email: customer.email,
    phone: '0599000123',
    password: PASSWORD,
    role: 'customer',
    area: 'Al-Bireh',
    governorate: 'رام الله والبيرة',
    privacyPolicy: true,
  });
  assert.equal(again.status, 201, JSON.stringify(again.body));
});

test('an account with an order in progress is not deleted', async () => {
  const driver = await account('provider');
  const customer = await account('customer');
  await Order.create({
    customerId: customer.user._id, providerId: driver.user._id, type: 'product', description: 'x', phone: '0599', area: 'Al-Bireh', status: 'fulfilling',
  });
  await assert.rejects(
    permanentlyDeleteAccount(await User.findById(driver.user._id)),
    AccountDeletionBlockedError,
  );
  assert.equal(await User.countDocuments({ _id: driver.user._id }), 1);
});

test('the driver rates the customer once, after the order is completed', async () => {
  const driver = await account('provider');
  const customer = await account('customer');
  const order = await Order.create({
    customerId: customer.user._id, providerId: driver.user._id, type: 'product', description: 'x', phone: '0599', area: 'Al-Bireh', status: 'fulfilling',
  });

  const early = await request(app)
    .post(`/api/orders/${order._id}/customer-rating`)
    .set(bearer(driver.token))
    .send({ rating: 5 });
  assert.equal(early.status, 409);

  await Order.updateOne({ _id: order._id }, { $set: { status: 'completed' } });
  const rated = await request(app)
    .post(`/api/orders/${order._id}/customer-rating`)
    .set(bearer(driver.token))
    .send({ rating: 4 });
  assert.equal(rated.status, 201);

  const again = await request(app)
    .post(`/api/orders/${order._id}/customer-rating`)
    .set(bearer(driver.token))
    .send({ rating: 1 });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'RATING_EXISTS');

  // Customers cannot use the driver's route.
  await request(app)
    .post(`/api/orders/${order._id}/customer-rating`)
    .set(bearer(customer.token))
    .send({ rating: 5 })
    .expect(403);

  const summary = (await customerRatingSummaries([customer.user._id])).get(customer.user._id.toString());
  assert.deepEqual(summary, { average: 4, count: 1 });
  assert.equal(await Notification.countDocuments({ userId: customer.user._id, type: 'new_rating' }), 1);
});

test('a guest can read support replies and answer, with their key only', async () => {
  const created = await request(app).post('/api/chat/contact').send({
    name: 'Guest', email: 'guest@example.test', phone: '0599000999', text: 'I cannot sign in',
  });
  assert.equal(created.status, 201);
  const { contactId, accessToken } = created.body;
  assert.ok(contactId && accessToken && accessToken.length >= 40);

  // The dashboard reply as stored by POST /api/chat/admin/reply/contact:<id>.
  const contact = await ContactRequest.findById(contactId);
  contact.messages.push({ sender: 'admin', text: 'Please reset your password.' });
  await contact.save();

  await request(app).get(`/api/chat/contact/${contactId}/messages`).expect(404);
  await request(app)
    .get(`/api/chat/contact/${contactId}/messages`)
    .set('X-Contact-Token', 'x'.repeat(43))
    .expect(404);

  const thread = await request(app)
    .get(`/api/chat/contact/${contactId}/messages`)
    .set('X-Contact-Token', accessToken);
  assert.equal(thread.status, 200);
  assert.deepEqual(thread.body.messages.map((m) => m.sender), ['guest', 'admin']);
  assert.equal(thread.body.messages[1].text, 'Please reset your password.');

  await request(app)
    .post(`/api/chat/contact/${contactId}/messages`)
    .set('X-Contact-Token', accessToken)
    .send({ text: 'Thanks, it works now.' })
    .expect(201);
  const stored = await ContactRequest.findById(contactId).select('+accessTokenHash');
  assert.equal(stored.messages.length, 2);
  assert.equal(stored.read, false);
  // Only a hash of the key is stored.
  assert.notEqual(stored.accessTokenHash, accessToken);
});

test('commission report: today and this month, by driver, in Palestine time', async () => {
  const now = new Date('2026-11-13T21:30:00Z'); // 23:30 in Palestine
  const today = reportPeriod('today', now);
  assert.equal(today.from.toISOString(), '2026-11-12T22:00:00.000Z');
  assert.equal(today.to.toISOString(), '2026-11-13T22:00:00.000Z');

  const a = await account('provider');
  const b = await account('provider');
  const customer = await account('customer');
  const base = { customerId: customer.user._id, type: 'product', description: 'x', phone: '0599', area: 'Al-Bireh' };
  await Order.create([
    { ...base, providerId: a.user._id, status: 'completed', price: 30, platformCommission: 3, acceptedAt: new Date('2026-11-13T08:00:00Z') },
    { ...base, providerId: a.user._id, status: 'accepted', price: 20, platformCommission: 2, acceptedAt: new Date('2026-11-13T21:00:00Z') },
    { ...base, providerId: b.user._id, status: 'completed', price: 50, platformCommission: 5, acceptedAt: new Date('2026-11-02T10:00:00Z') },
    // Waived by "reset": not platform income.
    { ...base, providerId: b.user._id, status: 'completed', price: 40, platformCommission: 0, acceptedAt: new Date('2026-11-13T09:00:00Z') },
    // Last month, and an order that was never accepted.
    { ...base, providerId: a.user._id, status: 'completed', price: 90, platformCommission: 9, acceptedAt: new Date('2026-10-31T21:30:00Z') },
    { ...base, status: 'pending', price: 0, platformCommission: 0 },
  ]);

  const day = await commissionReport('today', now);
  assert.equal(day.total, 5);
  assert.deepEqual(day.drivers.map((d) => [d.name, d.commission, d.orders]), [
    [a.user.fullName, 5, 2],
    [b.user.fullName, 0, 1],
  ]);

  const month = await commissionReport('month', now);
  assert.equal(month.total, 10);
  assert.deepEqual(month.drivers.map((d) => [d.driverId, d.commission]), [
    [a.user._id.toString(), 5],
    [b.user._id.toString(), 5],
  ]);
});
