const {
  boundedFiniteNumber,
} = require('./requestInput');

const EARTH_RADIUS_KM = 6371.0088;
const MAX_PROVIDER_SPEED_KMH = 300;
const LOCATION_JUMP_MIN_DISTANCE_KM = 1;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function haversineDistanceKm(
  latitude1,
  longitude1,
  latitude2,
  longitude2,
) {
  const deltaLatitude =
    toRadians(latitude2 - latitude1);
  const deltaLongitude =
    toRadians(longitude2 - longitude1);

  const a =
    Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(toRadians(latitude1))
      * Math.cos(toRadians(latitude2))
      * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function validateLocationUpdate({
  latitude,
  longitude,
  previousLatitude,
  previousLongitude,
  previousUpdatedAt,
  now = Date.now(),
  isMocked,
  accuracy,
  rejectMocked = false,
  maxSpeedKmh = MAX_PROVIDER_SPEED_KMH,
}) {
  const parsedLatitude = boundedFiniteNumber(latitude, {
    min: -90,
    max: 90,
  });
  const parsedLongitude = boundedFiniteNumber(longitude, {
    min: -180,
    max: 180,
  });

  if (parsedLatitude === null || parsedLongitude === null) {
    return {
      ok: false,
      code: 'INVALID_COORDINATES',
    };
  }

  if (
    rejectMocked
    && (isMocked === true || isMocked === 'true')
  ) {
    return {
      ok: false,
      code: 'MOCK_LOCATION',
    };
  }

  if (accuracy !== undefined && accuracy !== null) {
    const parsedAccuracy = boundedFiniteNumber(accuracy, {
      min: 0,
      max: 100000,
    });

    if (parsedAccuracy === null) {
      return {
        ok: false,
        code: 'INVALID_ACCURACY',
      };
    }

    if (parsedAccuracy > 5000) {
      return {
        ok: false,
        code: 'LOW_ACCURACY',
      };
    }
  }

  const previousLat = boundedFiniteNumber(previousLatitude, {
    min: -90,
    max: 90,
  });
  const previousLng = boundedFiniteNumber(previousLongitude, {
    min: -180,
    max: 180,
  });

  if (
    previousLat !== null
    && previousLng !== null
    && previousUpdatedAt
  ) {
    const previousTime =
      previousUpdatedAt instanceof Date
        ? previousUpdatedAt.getTime()
        : Date.parse(previousUpdatedAt);

    if (Number.isFinite(previousTime)) {
      const elapsedMs = Math.max(
        1,
        now - previousTime,
      );
      const distanceKm = haversineDistanceKm(
        previousLat,
        previousLng,
        parsedLatitude,
        parsedLongitude,
      );
      const speedKmh =
        distanceKm / (elapsedMs / (60 * 60 * 1000));

      if (
        distanceKm > LOCATION_JUMP_MIN_DISTANCE_KM
        && speedKmh > maxSpeedKmh
      ) {
        return {
          ok: false,
          code: 'LOCATION_JUMP',
        };
      }
    }
  }

  return {
    ok: true,
    latitude: parsedLatitude,
    longitude: parsedLongitude,
    mocked: isMocked === true || isMocked === 'true',
  };
}

module.exports = {
  EARTH_RADIUS_KM,
  MAX_PROVIDER_SPEED_KMH,
  LOCATION_JUMP_MIN_DISTANCE_KM,
  haversineDistanceKm,
  validateLocationUpdate,
};
