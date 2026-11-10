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

function isValidAdImageUrl(value) {
  if (!value) return true;

  return /^https?:\/\/\S+$/i.test(value)
    || /^\/uploads\/[A-Za-z0-9._-]+$/.test(value);
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

function normalizeAdPayload(body = {}) {
  const title = trimmed(body.title);
  const description = trimmed(body.body);
  const imageUrl = trimmed(body.imageUrl);
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

  if (!title || title.length > 120) {
    return {
      ok: false,
      message: 'عنوان الإعلان مطلوب وبحد أقصى 120 حرفاً.',
    };
  }

  if (description.length > 300) {
    return {
      ok: false,
      message: 'نص الإعلان يجب ألا يتجاوز 300 حرف.',
    };
  }

  if (!isValidAdImageUrl(imageUrl)) {
    return {
      ok: false,
      message: 'رابط الصورة يجب أن يبدأ بـ http/https أو /uploads/.',
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
      imageUrl,
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
    imageUrl: ad.imageUrl || '',
  };
}

module.exports = {
  AD_AUDIENCES,
  isValidAdImageUrl,
  normalizeAdPayload,
  publicAd,
};
