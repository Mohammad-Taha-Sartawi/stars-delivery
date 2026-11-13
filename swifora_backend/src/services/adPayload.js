const AD_AUDIENCES = Object.freeze([
  'all',
  'customers',
  'providers',
]);

function trimmed(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function parseOptionalDate(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime())
    ? date
    : undefined;
}

function normalizeAdPayload(body = {}, { imageCount = 0 } = {}) {
  const title = trimmed(body.title);
  const description = trimmed(body.body);
  const audience = trimmed(body.audience) || 'all';
  const rawSortOrder = body.sortOrder;
  const sortOrder = rawSortOrder === undefined || rawSortOrder === ''
    ? 0
    : Number(rawSortOrder);
  const startsAt = parseOptionalDate(body.startsAt);
  const endsAt = parseOptionalDate(body.endsAt);
  const isActive = body.isActive === undefined
    ? true
    : body.isActive === true || body.isActive === 'true';

  if (title.length > 120) {
    return {
      ok: false,
      message: 'عنوان الإعلان يجب ألا يتجاوز 120 حرفاً.',
    };
  }

  if (description.length > 300) {
    return {
      ok: false,
      message: 'نص الإعلان يجب ألا يتجاوز 300 حرف.',
    };
  }

  if (
    !title
    && !description
    && imageCount === 0
  ) {
    return {
      ok: false,
      message: 'أضف عنواناً أو نصاً أو صورة واحدة على الأقل للإعلان.',
    };
  }

  if (!AD_AUDIENCES.includes(audience)) {
    return {
      ok: false,
      message: 'الجهة المستهدفة غير صالحة.',
    };
  }

  if (
    !Number.isInteger(sortOrder)
    || sortOrder < 0
    || sortOrder > 9999
  ) {
    return {
      ok: false,
      message: 'ترتيب الإعلان يجب أن يكون رقماً بين 0 و9999.',
    };
  }

  if (startsAt === undefined || endsAt === undefined) {
    return {
      ok: false,
      message: 'تاريخ بداية أو نهاية الإعلان غير صالح.',
    };
  }

  if (startsAt && endsAt && endsAt <= startsAt) {
    return {
      ok: false,
      message: 'تاريخ نهاية الإعلان يجب أن يكون بعد تاريخ البداية.',
    };
  }

  return {
    ok: true,
    value: {
      title,
      body: description,
      audience,
      isActive,
      startsAt,
      endsAt,
      sortOrder,
    },
  };
}

function publicAd(ad) {
  return {
    _id: ad._id?.toString?.() || '',
    title: ad.title || '',
    body: ad.body || '',
    images: Array.isArray(ad.images) ? ad.images : [],
    startsAt: ad.startsAt || null,
    endsAt: ad.endsAt || null,
  };
}

module.exports = {
  AD_AUDIENCES,
  normalizeAdPayload,
  publicAd,
};
