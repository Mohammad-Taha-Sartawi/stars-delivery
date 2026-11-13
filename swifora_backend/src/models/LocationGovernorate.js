const mongoose = require('mongoose');

// Palestine governorates and their cities/villages, seeded from
// src/data/palestine-locations.json (see services/locationCatalog.js).
// The mobile app reads them through /api/locations instead of bundling a
// 46 MB worldwide asset.
const citySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Arabic display name; `name` (English) stays the stored account value.
    native: { type: String, default: '', trim: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  { _id: false },
);

const locationGovernorateSchema = new mongoose.Schema(
  {
    // English name from the source data; stable key used by the app.
    name: { type: String, required: true, unique: true, trim: true },
    // Arabic display name.
    native: { type: String, required: true, trim: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    // Position in the source list, so the app keeps its dropdown order.
    order: { type: Number, required: true },
    cities: { type: [citySchema], default: [] },
    dataVersion: { type: Number, required: true },
  },
  { collection: 'location_governorates', timestamps: true },
);

module.exports = mongoose.model(
  'LocationGovernorate',
  locationGovernorateSchema,
);
