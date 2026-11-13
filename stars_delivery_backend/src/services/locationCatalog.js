// Palestine location catalog stored in MongoDB.
//
// Source of truth: src/data/palestine-locations.json (Palestine only).
// seedLocationCatalog() copies it into the `location_governorates`
// collection whenever the stored data version differs, so deploying a new
// file version refreshes the collection on the next start.
const path = require('path');
const fs = require('fs');
const LocationGovernorate = require('../models/LocationGovernorate');

const DATA_FILE = path.join(__dirname, '..', 'data', 'palestine-locations.json');

// Same cut-off the app used: squared-degree distance 0.25 (~50 km).
const NEAREST_MAX_DISTANCE_SQ = 0.25;

function readLocationData(file = DATA_FILE) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data.governorates) || !Number.isInteger(data.version)) {
    throw new Error('Invalid location data file');
  }
  return data;
}

async function seedLocationCatalog({
  Model = LocationGovernorate,
  data = readLocationData(),
} = {}) {
  const current = await Model.countDocuments({ dataVersion: data.version });
  if (current === data.governorates.length) {
    return { seeded: false, count: current };
  }

  const names = [];
  await Model.bulkWrite(
    data.governorates.map((g, order) => {
      names.push(g.name);
      return {
        replaceOne: {
          filter: { name: g.name },
          replacement: {
            name: g.name,
            native: g.native,
            latitude: g.latitude ?? null,
            longitude: g.longitude ?? null,
            order,
            cities: g.cities.map((c) => ({
              name: c.name,
              native: c.native || '',
              latitude: c.latitude ?? null,
              longitude: c.longitude ?? null,
            })),
            dataVersion: data.version,
          },
          upsert: true,
        },
      };
    }),
  );
  await Model.deleteMany({ name: { $nin: names } });
  invalidateLocationCache();
  return { seeded: true, count: data.governorates.length };
}

// The catalog is small and changes only on reseed, so keep one copy in
// memory after the first database read.
let cache = null;

function invalidateLocationCache() {
  cache = null;
}

async function getGovernorates({ Model = LocationGovernorate } = {}) {
  if (cache) return cache;
  const rows = await Model.find({}, { _id: 0, __v: 0, createdAt: 0, updatedAt: 0 })
    .sort({ order: 1 })
    .lean();
  if (rows.length > 0) cache = rows;
  return rows;
}

// Pure: nearest governorate name to a point, using the cities' coordinates
// (or the governorate centre when it has no cities). Returns null beyond the
// cut-off, e.g. outside Palestine.
function nearestGovernorate(governorates, latitude, longitude) {
  let best = null;
  let bestDistance = Infinity;
  const consider = (name, lat, lng) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const dLat = latitude - lat;
    const dLng = longitude - lng;
    const distance = dLat * dLat + dLng * dLng;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = name;
    }
  };
  for (const g of governorates) {
    if (g.cities && g.cities.length > 0) {
      for (const c of g.cities) consider(g.name, c.latitude, c.longitude);
    } else {
      consider(g.name, g.latitude, g.longitude);
    }
  }
  return bestDistance <= NEAREST_MAX_DISTANCE_SQ ? best : null;
}

module.exports = {
  DATA_FILE,
  NEAREST_MAX_DISTANCE_SQ,
  readLocationData,
  seedLocationCatalog,
  getGovernorates,
  invalidateLocationCache,
  nearestGovernorate,
};
