const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeAdPayload,
  isValidAdImageUrl,
} = require('../src/services/adPayload');
const Ad = require('../src/models/Ad');

const backendRoot = path.resolve(__dirname, '..');

function source(relativePath) {
  return fs.readFileSync(
    path.join(backendRoot, relativePath),
    'utf8',
  );
}

test('ad payload validates title, audience, dates, order, and image URL', () => {
  const valid = normalizeAdPayload({
    title: 'عرض خاص',
    body: 'خصم على التوصيل',
    imageUrl: '/uploads/ad.png',
    audience: 'customers',
    isActive: true,
    startsAt: '2026-11-10T10:00:00.000Z',
    endsAt: '2026-11-20T10:00:00.000Z',
    sortOrder: 2,
  });

  assert.equal(valid.ok, true);
  assert.equal(valid.value.title, 'عرض خاص');
  assert.equal(valid.value.audience, 'customers');
  assert.equal(valid.value.sortOrder, 2);

  assert.equal(
    normalizeAdPayload({ title: '' }).ok,
    false,
  );
  assert.equal(
    normalizeAdPayload({
      title: 'Ad',
      audience: 'unknown',
    }).ok,
    false,
  );
  assert.equal(
    normalizeAdPayload({
      title: 'Ad',
      startsAt: 'not-a-date',
    }).ok,
    false,
  );
  assert.equal(
    normalizeAdPayload({
      title: 'Ad',
      startsAt: '2026-11-20T10:00:00.000Z',
      endsAt: '2026-11-10T10:00:00.000Z',
    }).ok,
    false,
  );
  assert.equal(
    normalizeAdPayload({
      title: 'Ad',
      sortOrder: -1,
    }).ok,
    false,
  );

  assert.equal(isValidAdImageUrl(''), true);
  assert.equal(isValidAdImageUrl('https://example.com/ad.png'), true);
  assert.equal(isValidAdImageUrl('/uploads/ad.png'), true);
  assert.equal(isValidAdImageUrl('javascript:alert(1)'), false);
});

test('ad model and routes keep public previews limited to active ads', () => {
  assert.equal(
    Ad.schema.path('title').options.maxlength,
    120,
  );
  assert.equal(
    Ad.schema.path('body').options.maxlength,
    300,
  );
  assert.equal(
    Ad.schema.path('audience').options.enum.includes('providers'),
    true,
  );

  const publicRoute = source('src/routes/ads.js');
  const adminRoute = source('src/routes/adminAds.js');
  const index = source('src/index.js');

  assert.match(publicRoute, /isActive: true/);
  assert.match(publicRoute, /audience: \{ \$in: \['all', audience\] \}/);
  assert.match(publicRoute, /startsAt: \{ \$lte: now \}/);
  assert.match(publicRoute, /endsAt: \{ \$gte: now \}/);
  assert.match(publicRoute, /limit\(5\)/);

  assert.match(adminRoute, /normalizeAdPayload/);
  assert.match(adminRoute, /router\.post\('\/'/);
  assert.match(adminRoute, /router\.put\('\/:id'/);
  assert.match(adminRoute, /router\.put\('\/:id\/status'/);
  assert.match(adminRoute, /router\.delete\('\/:id'/);

  assert.match(index, /app\.use\('\/api\/ads', adRoutes\)/);
  assert.match(
    index,
    /app\.use\('\/admin\/ads', requireAdminSession, adminCsrfProtection, adminAdRoutes\)/,
  );
  assert.match(index, /Ad\.createIndexes\(\)/);
});

test('admin dashboard exposes ad management controls', () => {
  const sidebar = source('src/views/admin/partials/sidebar.ejs');
  const page = source('src/views/admin/index.ejs');
  const browser = source('src/public/js/main.js');

  assert.match(sidebar, /data-page="ads"/);
  assert.match(page, /id="page-ads"/);
  assert.match(page, /id="adForm"/);
  assert.match(page, /id="adsList"/);
  assert.match(browser, /loadAds/);
  assert.match(browser, /saveAd/);
  assert.match(browser, /data-admin-action="editAd"/);
  assert.match(browser, /data-admin-action="deleteAd"/);
  assert.match(browser, /data-admin-action="toggleAd"/);
});
