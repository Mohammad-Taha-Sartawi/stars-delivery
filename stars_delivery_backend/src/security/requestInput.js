function boundedTrimmedString(value, maxLength) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > maxLength) {
    return null;
  }

  return trimmed;
}

function optionalBoundedTrimmedString(value, maxLength) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    return null;
  }

  return trimmed;
}

function boundedFiniteNumber(value, { min, max }) {
  const number =
    typeof value === 'number'
      ? value
      : (
        typeof value === 'string'
        && value.trim() !== ''
          ? Number(value)
          : NaN
      );

  if (
    !Number.isFinite(number)
    || number < min
    || number > max
  ) {
    return null;
  }

  return number;
}

module.exports = {
  boundedTrimmedString,
  optionalBoundedTrimmedString,
  boundedFiniteNumber,
};
