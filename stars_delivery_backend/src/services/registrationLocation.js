const { CITIES_BY_GOVERNORATE } = require('./palestineCities');

const PRIMARY_GOVERNORATES = [
  'القدس',
  'رام الله والبيرة',
  'الخليل',
  'نابلس',
  'بيت لحم',
  'أريحا',
  'سلفيت',
  'جنين',
  'طولكرم',
  'قلقيلية',
  'طوباس',
  'غزة',
  'خان يونس',
  'رفح',
  'دير البلح',
  'شمال غزة',
];

// Canonical governorates plus aliases used by older accounts. The four
// interior governorates are only shown in the areas report when data exists.
const GOVERNORATE_DEFINITIONS = [
  {
    name: 'القدس',
    aliases: ['Jerusalem (Quds)', 'Jerusalem'],
  },
  {
    name: 'رام الله والبيرة',
    aliases: ['رام الله', 'Ramallah'],
  },
  { name: 'الخليل', aliases: ['Hebron'] },
  { name: 'نابلس', aliases: ['Nablus'] },
  { name: 'بيت لحم', aliases: ['Bethlehem'] },
  { name: 'أريحا', aliases: ['Jericho'] },
  { name: 'سلفيت', aliases: ['Salfit'] },
  { name: 'جنين', aliases: ['Jenin'] },
  { name: 'طولكرم', aliases: ['Tulkarm'] },
  { name: 'قلقيلية', aliases: ['Qalqilya'] },
  { name: 'طوباس', aliases: ['Tubas'] },
  { name: 'غزة', aliases: ['Gaza'] },
  { name: 'خان يونس', aliases: ['Khan Yunis'] },
  { name: 'رفح', aliases: ['Rafah'] },
  { name: 'دير البلح', aliases: ['Deir El Balah', 'Deir al-Balah'] },
  { name: 'شمال غزة', aliases: ['North Gaza'] },
  { name: 'حيفا', aliases: ['Haifa'] },
  { name: 'عكا', aliases: ['Acre'] },
  { name: 'الناصرة', aliases: ['Nazareth'] },
  { name: 'يافا', aliases: ['Jaffa'] },
];

const aliasToGovernorate = new Map();

for (const definition of GOVERNORATE_DEFINITIONS) {
  aliasToGovernorate.set(
    definition.name.toLowerCase(),
    definition.name,
  );
  for (const alias of definition.aliases) {
    aliasToGovernorate.set(
      alias.trim().toLowerCase(),
      definition.name,
    );
  }
}

function normalizeValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function canonicalGovernorate(value) {
  const normalized = normalizeValue(value);
  if (!normalized) return '';
  return aliasToGovernorate.get(normalized.toLowerCase()) || '';
}

function governorateKey(record = {}) {
  return (
    canonicalGovernorate(record.governorate)
    || canonicalGovernorate(record.area)
    || normalizeValue(record.governorate)
    || ''
  );
}

function isValidAreaForGovernorate(governorate, area) {
  const canonical =
    canonicalGovernorate(governorate) || normalizeValue(governorate);
  const normalizedArea = normalizeValue(area);

  if (!canonical || !normalizedArea) return false;

  // The "governorate itself" option stores the canonical governorate name.
  if (
    normalizedArea === canonical
    || canonicalGovernorate(normalizedArea) === canonical
  ) {
    return true;
  }

  const cities = CITIES_BY_GOVERNORATE[canonical] || [];
  return cities.includes(normalizedArea);
}

/**
 * Resolves the governorate and the village/city for a registered account.
 * New accounts store both; legacy accounts stored only one `area` value, so
 * a governorate-looking area is treated as the governorate itself.
 */
function resolveRegistrationLocation(record = {}) {
  const rawGovernorate = normalizeValue(record.governorate);
  const rawArea = normalizeValue(record.area);
  const governorateFromField = canonicalGovernorate(rawGovernorate);
  const governorateFromArea = canonicalGovernorate(rawArea);
  const governorate =
    governorateFromField
    || governorateFromArea
    || rawGovernorate
    || 'غير محدد';

  const areaIsGovernorate = Boolean(rawArea)
    && (
      governorateFromArea
        ? governorateFromArea === (governorateFromField || governorate)
        : rawArea === governorate || rawArea === rawGovernorate
    );

  return {
    governorate,
    city: areaIsGovernorate ? 'من المحافظة نفسها' : (rawArea || 'غير محدد'),
    area: rawArea,
  };
}

function accountEntry(record) {
  return {
    id:
      record?._id?.toString?.()
      || record?.id?.toString?.()
      || '',
    fullName: record?.fullName || record?.name || 'غير محدد',
    publicId: record?.publicId || '',
  };
}

function emptyGroup() {
  return {
    totalDrivers: 0,
    totalUsers: 0,
    cities: new Map(),
  };
}

function buildGovernorateStats(drivers = [], users = []) {
  const groups = new Map();

  for (const name of PRIMARY_GOVERNORATES) {
    groups.set(name, emptyGroup());
  }

  const ensureGroup = (name) => {
    if (!groups.has(name)) {
      groups.set(name, emptyGroup());
    }
    return groups.get(name);
  };

  const addRecord = (record, countKey, cityKey, accountsKey) => {
    const location = resolveRegistrationLocation(record);
    const group = ensureGroup(location.governorate);
    group[countKey] += 1;

    const cityName = location.city || 'غير محدد';
    if (!group.cities.has(cityName)) {
      group.cities.set(cityName, {
        drivers: 0,
        users: 0,
        driverAccounts: [],
        userAccounts: [],
      });
    }
    const city = group.cities.get(cityName);
    city[cityKey] += 1;
    city[accountsKey].push(accountEntry(record));
  };

  for (const driver of drivers) {
    addRecord(driver, 'totalDrivers', 'drivers', 'driverAccounts');
  }
  for (const user of users) {
    addRecord(user, 'totalUsers', 'users', 'userAccounts');
  }

  const stats = {};
  for (const [name, group] of groups.entries()) {
    const cities = [...group.cities.entries()]
      .map(([cityName, counts]) => ({
        name: cityName,
        drivers: counts.drivers,
        users: counts.users,
        total: counts.drivers + counts.users,
        driverAccounts: counts.driverAccounts,
        userAccounts: counts.userAccounts,
      }))
      .sort(
        (a, b) =>
          b.total - a.total
          || a.name.localeCompare(b.name, 'ar'),
      );

    stats[name] = {
      totalDrivers: group.totalDrivers,
      totalUsers: group.totalUsers,
      total: group.totalDrivers + group.totalUsers,
      cities,
    };
  }

  const primaryIndex = new Map(
    PRIMARY_GOVERNORATES.map((name, index) => [name, index]),
  );
  const governorateOrder = Object.keys(stats).sort((a, b) => {
    const byTotal = stats[b].total - stats[a].total;
    if (byTotal !== 0) return byTotal;

    const aIndex = primaryIndex.has(a) ? primaryIndex.get(a) : 999;
    const bIndex = primaryIndex.has(b) ? primaryIndex.get(b) : 999;
    if (aIndex !== bIndex) return aIndex - bIndex;

    return a.localeCompare(b, 'ar');
  });

  return { stats, governorateOrder };
}

module.exports = {
  PRIMARY_GOVERNORATES,
  canonicalGovernorate,
  governorateKey,
  isValidAreaForGovernorate,
  resolveRegistrationLocation,
  buildGovernorateStats,
};
