const { haversineMeters } = require('./geo');

function allowedRadiusMeters(accuracyMeters, config) {
  const acc = Math.max(0, Number(accuracyMeters) || 0);
  const accBuffer = Math.min(acc, config.officeRadiusGpsBufferCapMeters);
  return config.officeRadiusMeters + accBuffer;
}

/** Closest assigned office within check-in radius, if any. */
function findCheckInOffice(lat, lng, accuracyMeters, offices, config) {
  const allowed = allowedRadiusMeters(accuracyMeters, config);
  let best = null;
  for (const office of offices) {
    if (office.lat == null || office.lng == null) continue;
    const dist = haversineMeters(Number(lat), Number(lng), Number(office.lat), Number(office.lng));
    if (dist <= allowed && (!best || dist < best.distance_m)) {
      best = { office, distance_m: dist, allowed_m: allowed };
    }
  }
  return best;
}

/** Nearest assigned office by distance (for error messages / UI preview). */
function nearestAssignedOffice(lat, lng, offices) {
  let best = null;
  for (const office of offices) {
    if (office.lat == null || office.lng == null) continue;
    const dist = haversineMeters(Number(lat), Number(lng), Number(office.lat), Number(office.lng));
    if (!best || dist < best.distance_m) {
      best = { office, distance_m: dist };
    }
  }
  return best;
}

module.exports = {
  allowedRadiusMeters,
  findCheckInOffice,
  nearestAssignedOffice,
};
