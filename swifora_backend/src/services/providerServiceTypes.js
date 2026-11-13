const SERVICE_TYPES = Object.freeze([
  'product',
  'people',
  'goods',
]);

const SERVICE_TYPE_LABELS = Object.freeze({
  product: 'توصيل منتجات',
  people: 'توصيل ركاب',
  goods: 'نقل بضائع',
});

const DRIVER_CATEGORIES = Object.freeze([
  'public',
  'private',
  'truck',
  'motorcycle',
]);

function normalizeServiceTypes(raw) {
  if (raw === undefined || raw === null) {
    return [];
  }

  const values = Array.isArray(raw)
    ? raw
    : String(raw).split(',');

  return [
    ...new Set(
      values
        .map((value) => String(value).trim())
        .filter((value) => SERVICE_TYPES.includes(value)),
    ),
  ];
}

function serviceTypesFromAdminLabel(label) {
  const text = String(label || '');

  return SERVICE_TYPES.filter((type) => {
    if (type === 'product') {
      return text.includes('منتجات');
    }
    if (type === 'people') {
      return text.includes('ركاب');
    }
    if (type === 'goods') {
      return text.includes('بضائع');
    }
    return false;
  });
}

function serviceTypesLabel(types) {
  const normalized = normalizeServiceTypes(types);

  if (normalized.length === 0 || normalized.length === SERVICE_TYPES.length) {
    return 'جميع الخدمات';
  }

  return normalized.map((type) => SERVICE_TYPE_LABELS[type]).join(' + ');
}

function driverCategoryForProvider(provider = {}) {
  const licenseType = String(provider.licenseType || '').trim();

  if (licenseType.includes('عمومي') || licenseType.includes('متعدد')) {
    return 'public';
  }

  if (licenseType.includes('بضائع') || licenseType.includes('شاحنة')) {
    return 'truck';
  }

  if (licenseType.includes('منتجات') || licenseType.includes('دراجة')) {
    return 'motorcycle';
  }

  if (licenseType.includes('ركاب') || licenseType.includes('خاص')) {
    return 'private';
  }

  const serviceTypes = normalizeServiceTypes(provider.serviceTypes);

  if (serviceTypes.length >= 2) {
    return 'public';
  }

  if (serviceTypes.length === 1) {
    if (serviceTypes[0] === 'goods') return 'truck';
    if (serviceTypes[0] === 'people') return 'private';
    if (serviceTypes[0] === 'product') return 'motorcycle';
  }

  return 'unknown';
}

module.exports = {
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  DRIVER_CATEGORIES,
  normalizeServiceTypes,
  serviceTypesFromAdminLabel,
  serviceTypesLabel,
  driverCategoryForProvider,
};
