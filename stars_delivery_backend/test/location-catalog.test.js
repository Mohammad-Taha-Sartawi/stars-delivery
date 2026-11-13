const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readLocationData,
  nearestGovernorate,
  seedLocationCatalog,
} = require('../src/services/locationCatalog');
const { CITIES_BY_GOVERNORATE } = require('../src/services/palestineCities');

const data = readLocationData();

// The app stores some governorates under a canonical Arabic name that differs
// from the source `native` field (see lib/services/location_catalog.dart).
const CANONICAL_AREA = {
  'Jerusalem (Quds)': 'القدس',
  Ramallah: 'رام الله والبيرة',
  Jericho: 'أريحا',
};

test('location data contains Palestine only: 16 governorates, 132 cities', () => {
  assert.equal(data.governorates.length, 16);
  const cities = data.governorates.flatMap((g) => g.cities);
  assert.equal(cities.length, 132);
  for (const city of cities) {
    // Rough Palestine bounding box (West Bank + Gaza Strip).
    assert.ok(city.latitude > 31.1 && city.latitude < 32.7, city.name);
    assert.ok(city.longitude > 34.1 && city.longitude < 35.7, city.name);
  }
});

test('location data matches the server registration catalog city by city', () => {
  for (const g of data.governorates) {
    const key = CANONICAL_AREA[g.name] || g.native;
    assert.deepEqual(
      [...g.cities.map((c) => c.name)].sort(),
      [...(CITIES_BY_GOVERNORATE[key] || [])].sort(),
      g.name,
    );
  }
});

test('nearestGovernorate resolves points inside Palestine and rejects others', () => {
  const g = data.governorates;
  assert.equal(nearestGovernorate(g, 31.9104, 35.2137), 'Ramallah'); // Al-Bireh
  assert.equal(nearestGovernorate(g, 31.5017, 34.4668), 'Gaza'); // Gaza City
  assert.equal(nearestGovernorate(g, 31.5326, 35.0998), 'Hebron');
  assert.equal(nearestGovernorate(g, 30.0444, 31.2357), null); // Cairo
});

function fakeModel({ existing }) {
  const calls = { bulkWrite: [], deleteMany: [] };
  return {
    calls,
    countDocuments: async () => existing,
    bulkWrite: async (ops) => {
      calls.bulkWrite.push(ops);
    },
    deleteMany: async (filter) => {
      calls.deleteMany.push(filter);
    },
  };
}

test('seedLocationCatalog upserts every governorate when the version is missing', async () => {
  const Model = fakeModel({ existing: 0 });
  const result = await seedLocationCatalog({ Model, data });
  assert.deepEqual(result, { seeded: true, count: 16 });
  const ops = Model.calls.bulkWrite[0];
  assert.equal(ops.length, 16);
  assert.equal(ops[0].replaceOne.upsert, true);
  assert.equal(ops[0].replaceOne.replacement.order, 0);
  assert.equal(ops[0].replaceOne.replacement.dataVersion, data.version);
  assert.deepEqual(Model.calls.deleteMany[0].name.$nin.length, 16);
});

test('seedLocationCatalog is a no-op when the current version is already stored', async () => {
  const Model = fakeModel({ existing: 16 });
  const result = await seedLocationCatalog({ Model, data });
  assert.deepEqual(result, { seeded: false, count: 16 });
  assert.equal(Model.calls.bulkWrite.length, 0);
});
