const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  canonicalGovernorate,
  resolveRegistrationLocation,
  buildGovernorateStats,
} = require('../src/services/registrationLocation');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('registration location keeps governorate and city separate', () => {
  assert.equal(
    canonicalGovernorate('Ramallah'),
    'رام الله والبيرة',
  );

  assert.deepEqual(
    resolveRegistrationLocation({
      governorate: 'رام الله والبيرة',
      area: 'Al-Bireh',
    }),
    {
      governorate: 'رام الله والبيرة',
      city: 'Al-Bireh',
      area: 'Al-Bireh',
    },
  );

  assert.deepEqual(
    resolveRegistrationLocation({
      governorate: 'بيت لحم',
      area: 'بيت لحم',
    }),
    {
      governorate: 'بيت لحم',
      city: 'من المحافظة نفسها',
      area: 'بيت لحم',
    },
  );

  // Legacy accounts stored the governorate itself in `area`.
  assert.deepEqual(
    resolveRegistrationLocation({ area: 'الخليل' }),
    {
      governorate: 'الخليل',
      city: 'من المحافظة نفسها',
      area: 'الخليل',
    },
  );
});

test('areas stats group by governorate and sort by totals', () => {
  const { stats, governorateOrder } = buildGovernorateStats(
    [
      { governorate: 'رام الله والبيرة', area: 'Al-Bireh' },
      { governorate: 'رام الله والبيرة', area: 'رام الله والبيرة' },
      { area: 'الخليل' },
    ],
    [
      { governorate: 'رام الله والبيرة', area: 'Al-Bireh' },
      { governorate: 'بيت لحم', area: 'بيت لحم' },
    ],
  );

  assert.deepEqual(governorateOrder.slice(0, 4), [
    'رام الله والبيرة',
    'الخليل',
    'بيت لحم',
    'القدس',
  ]);

  assert.deepEqual(stats['رام الله والبيرة'], {
    totalDrivers: 2,
    totalUsers: 1,
    total: 3,
    cities: [
      {
        name: 'Al-Bireh',
        drivers: 1,
        users: 1,
        total: 2,
        driverAccounts: [
          { id: '', fullName: 'غير محدد', publicId: '' },
        ],
        userAccounts: [
          { id: '', fullName: 'غير محدد', publicId: '' },
        ],
      },
      {
        name: 'من المحافظة نفسها',
        drivers: 1,
        users: 0,
        total: 1,
        driverAccounts: [
          { id: '', fullName: 'غير محدد', publicId: '' },
        ],
        userAccounts: [],
      },
    ],
  });

  assert.equal(stats['بيت لحم'].totalUsers, 1);
  assert.equal(stats['الخليل'].totalDrivers, 1);
  assert.ok(governorateOrder.includes('غزة'));
});

test('area details list user and driver names under each village', () => {
  const { stats } = buildGovernorateStats(
    [
      {
        _id: { toString: () => 'driver-1' },
        fullName: 'Driver One',
        publicId: 'DRV-1',
        governorate: 'رام الله والبيرة',
        area: 'Al-Bireh',
      },
    ],
    [
      {
        _id: { toString: () => 'user-1' },
        fullName: 'User One',
        publicId: 'USR-1',
        governorate: 'رام الله والبيرة',
        area: 'Al-Bireh',
      },
    ],
  );

  const city = stats['رام الله والبيرة'].cities[0];
  assert.equal(city.name, 'Al-Bireh');
  assert.deepEqual(city.driverAccounts, [
    { id: 'driver-1', fullName: 'Driver One', publicId: 'DRV-1' },
  ]);
  assert.deepEqual(city.userAccounts, [
    { id: 'user-1', fullName: 'User One', publicId: 'USR-1' },
  ]);
});

test('registration stores the governorate in users and pending providers', () => {
  const auth = source('src/routes/auth.js');
  const pendingModel = source('src/models/PendingProvider.js');
  const userModel = source('src/models/User.js');
  const mobileSession = source('src/services/mobileSession.js');

  assert.match(auth, /governorate,/);
  assert.match(auth, /registrationGovernorate/);
  assert.match(auth, /governorate:\s*registrationGovernorate/);
  assert.match(pendingModel, /governorate:\s*\{ type: String/);
  assert.match(userModel, /governorate:\s*\{ type: String/);
  assert.match(mobileSession, /governorate:\s*user\.governorate/);
});

test('drivers and users APIs expose governorate and city', () => {
  const drivers = source('src/routes/adminDrivers.js');
  const users = source('src/routes/adminUsers.js');

  assert.match(drivers, /resolveRegistrationLocation/);
  assert.match(drivers, /governorate:\s*location\.governorate/);
  assert.match(drivers, /city:\s*location\.city/);
  assert.match(drivers, /governorate:\s*pending\.governorate/);

  assert.match(users, /resolveRegistrationLocation/);
  assert.match(users, /governorate:\s*location\.governorate/);
  assert.match(users, /city:\s*location\.city/);
});

test('areas report and admin screens display governorate totals', () => {
  const areas = source('src/routes/adminAreas.js');
  const main = source('src/public/js/main.js');
  const view = source('src/views/admin/index.ejs');

  assert.match(areas, /buildGovernorateStats/);
  assert.match(areas, /governorateOrder/);

  assert.match(main, /driver\.governorate/);
  assert.match(main, /driver\.city/);
  assert.match(main, /user\.governorate/);
  assert.match(main, /user\.city/);
  assert.match(main, /provider\.governorate/);
  assert.match(main, /provider\.city/);
  assert.match(main, /city\.driverAccounts/);
  assert.match(main, /city\.userAccounts/);
  assert.match(main, /account-chip/);
  assert.match(main, /escapeHtml\(account\.fullName/);
  assert.match(view, /areas-legend/);
  assert.match(view, /مرتبة حسب الإجمالي تنازلياً/);
});
