// Public, read-only Palestine location catalog for the mobile app.
// Registration needs it before login, so these routes do not require auth.
const express = require('express');
const { createIpActionLimiter } = require('../security/actionRateLimit');
const {
  getGovernorates,
  nearestGovernorate,
} = require('../services/locationCatalog');

const router = express.Router();

const locationCatalogLimiter = createIpActionLimiter({
  prefix: 'location-catalog',
  windowMs: 60 * 1000,
  limit: 60,
});

router.use(locationCatalogLimiter);

// GET /api/locations/governorates
// -> [{ name, native, cities: [cityName, ...] }] in source order.
router.get('/governorates', async (req, res) => {
  try {
    const governorates = await getGovernorates();
    res.set('Cache-Control', 'public, max-age=3600');
    return res.json(
      governorates.map((g) => ({
        name: g.name,
        native: g.native,
        cities: (g.cities || []).map((c) => c.name),
      })),
    );
  } catch (err) {
    console.error('Location catalog read failed:', err.message);
    return res.status(500).json({ error: 'Failed to load locations' });
  }
});

function parseCoordinate(raw, min, max) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

// GET /api/locations/nearest?lat=..&lng=..
// -> { area: governorateName | null }
router.get('/nearest', async (req, res) => {
  const latitude = parseCoordinate(req.query.lat, -90, 90);
  const longitude = parseCoordinate(req.query.lng, -180, 180);
  if (latitude === null || longitude === null) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  try {
    const governorates = await getGovernorates();
    return res.json({
      area: nearestGovernorate(governorates, latitude, longitude),
    });
  } catch (err) {
    console.error('Nearest location lookup failed:', err.message);
    return res.status(500).json({ error: 'Failed to resolve location' });
  }
});

module.exports = router;
