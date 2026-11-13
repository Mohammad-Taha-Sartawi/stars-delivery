// Location catalog: seed into a real (in-memory) MongoDB and query it over
// HTTP through the production router.
const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server-core');

const locationRoutes = require('../src/routes/locations');
const {
  seedLocationCatalog,
  invalidateLocationCache,
} = require('../src/services/locationCatalog');
const LocationGovernorate = require('../src/models/LocationGovernorate');

let mongoServer;
let app;

before(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: {
      version: '8.2.6',
      downloadDir: path.join(os.tmpdir(), 'stars-delivery-mongodb-binaries'),
    },
  });
  await mongoose.connect(mongoServer.getUri('stars_locations_integration'));
  app = express();
  app.use('/api/locations', locationRoutes);
});

after(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

test('seeding writes 16 governorates once and is idempotent', async () => {
  const first = await seedLocationCatalog();
  assert.deepEqual(first, { seeded: true, count: 16 });
  assert.equal(await LocationGovernorate.countDocuments(), 16);

  const second = await seedLocationCatalog();
  assert.equal(second.seeded, false);
  assert.equal(await LocationGovernorate.countDocuments(), 16);
});

test('GET /api/locations/governorates returns the catalog in source order', async () => {
  invalidateLocationCache();
  const res = await request(app).get('/api/locations/governorates').expect(200);
  assert.equal(res.body.length, 16);
  assert.equal(res.body[0].name, 'Bethlehem');
  const ramallah = res.body.find((g) => g.name === 'Ramallah');
  assert.equal(ramallah.native, 'رام الله');
  const bireh = ramallah.cities.find((c) => c.name === 'Al-Bireh');
  assert.equal(bireh.native, 'البيرة');
  assert.equal(res.body.reduce((n, g) => n + g.cities.length, 0), 132);
  assert.match(res.headers['cache-control'], /max-age=3600/);
});

test('GET /api/locations/nearest resolves coordinates and validates input', async () => {
  const near = await request(app)
    .get('/api/locations/nearest')
    .query({ lat: '31.9104', lng: '35.2137' })
    .expect(200);
  assert.deepEqual(near.body, { area: 'Ramallah' });

  const far = await request(app)
    .get('/api/locations/nearest')
    .query({ lat: '30.0444', lng: '31.2357' })
    .expect(200);
  assert.deepEqual(far.body, { area: null });

  await request(app).get('/api/locations/nearest').query({ lat: 'x', lng: '35' }).expect(400);
  await request(app).get('/api/locations/nearest').query({ lat: '95', lng: '35' }).expect(400);
  await request(app).get('/api/locations/nearest').expect(400);
});
