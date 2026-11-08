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

module.exports = {
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  normalizeServiceTypes,
  serviceTypesFromAdminLabel,
  serviceTypesLabel,
};
