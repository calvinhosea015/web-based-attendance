const { haversineMeters } = require('./geo');
const { AppError } = require('./errors');

/**
 * Server-side checks for GPS / device signals (best-effort; not a substitute for hardware attestation).
 */
function assessGeoTrust({
  lat,
  lng,
  accuracyMeters,
  clientTimestampMs,
  serverNowMs,
  maxAccuracyM,
  maxSkewMs,
  lastLat,
  lastLng,
  lastTsMs,
  maxSpeedMps,
}) {
  const flags = [];

  if (accuracyMeters == null || Number.isNaN(Number(accuracyMeters))) {
    flags.push('missing_accuracy');
  } else {
    const acc = Number(accuracyMeters);
    if (acc <= 0) flags.push('suspicious_accuracy_non_positive');
    if (acc > maxAccuracyM) flags.push('low_gps_precision');
  }

  if (clientTimestampMs != null && !Number.isNaN(Number(clientTimestampMs))) {
    const skew = Math.abs(Number(serverNowMs) - Number(clientTimestampMs));
    if (skew > maxSkewMs) flags.push('client_clock_skew');
  } else {
    flags.push('missing_client_timestamp');
  }

  if (lastLat != null && lastLng != null && lastTsMs != null && clientTimestampMs != null) {
    const dtSec = (Number(clientTimestampMs) - Number(lastTsMs)) / 1000;
    if (dtSec > 0) {
      const dist = haversineMeters(Number(lastLat), Number(lastLng), Number(lat), Number(lng));
      const speed = dist / dtSec;
      if (speed > maxSpeedMps) flags.push('impossible_travel_speed');
    }
  }

  const fakeGpsHints = [];
  if (accuracyMeters != null && Number(accuracyMeters) === 0) {
    fakeGpsHints.push('zero_accuracy_common_in_mock_apps');
  }
  if (flags.includes('impossible_travel_speed')) fakeGpsHints.push('teleport_pattern');

  return { flags, fakeGpsHints };
}

function validateClockGeoOrThrow(input, env) {
  const {
    lat,
    lng,
    accuracyMeters,
    clientTimestampMs,
    lastLat,
    lastLng,
    lastClientTimestampMs,
  } = input;

  if (lat == null || lng == null) {
    throw new AppError('Latitude and longitude are required.', 400, 'GEO_REQUIRED');
  }

  const serverNowMs = Date.now();
  const { flags, fakeGpsHints } = assessGeoTrust({
    lat,
    lng,
    accuracyMeters,
    clientTimestampMs,
    serverNowMs,
    maxAccuracyM: env.maxGpsAccuracyMeters,
    maxSkewMs: env.maxClientClockSkewMs,
    lastLat,
    lastLng,
    lastTsMs: lastClientTimestampMs,
    maxSpeedMps: env.maxImpossibleSpeedMps,
  });

  if (flags.includes('missing_accuracy') || flags.includes('suspicious_accuracy_non_positive')) {
    throw new AppError('GPS accuracy is required and must be positive.', 400, 'GPS_ACCURACY_REQUIRED');
  }
  if (flags.includes('missing_client_timestamp')) {
    throw new AppError('Device timestamp is required for clock events.', 400, 'CLIENT_TS_REQUIRED');
  }
  if (flags.includes('low_gps_precision')) {
    throw new AppError(
      `GPS accuracy must be better than ${env.maxGpsAccuracyMeters}m.`,
      400,
      'GPS_ACCURACY_REJECTED'
    );
  }
  if (flags.includes('client_clock_skew')) {
    throw new AppError('Device clock does not match server time.', 400, 'CLOCK_SKEW');
  }
  if (flags.includes('impossible_travel_speed')) {
    throw new AppError('Movement speed from last fix is not physically plausible.', 400, 'SPEED_REJECTED');
  }

  return { flags, fakeGpsHints };
}

module.exports = { assessGeoTrust, validateClockGeoOrThrow };
