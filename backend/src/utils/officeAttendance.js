const { haversineMeters } = require('./geo');

/** Per-office base radius (admin can set it on the pabrik); falls back to the global default. */
function baseRadiusFor(office, config) {
  const perOffice = office && office.radius_meters != null ? Number(office.radius_meters) : null;
  return perOffice != null && perOffice > 0 ? perOffice : config.officeRadiusMeters;
}

function allowedRadiusMeters(accuracyMeters, config, office = null) {
  const acc = Math.max(0, Number(accuracyMeters) || 0);
  const accBuffer = Math.min(acc, config.officeRadiusGpsBufferCapMeters);
  return baseRadiusFor(office, config) + accBuffer;
}

/** Closest assigned office within its own check-in radius, if any. */
function findCheckInOffice(lat, lng, accuracyMeters, offices, config) {
  let best = null;
  for (const office of offices) {
    if (office.lat == null || office.lng == null) continue;
    const allowed = allowedRadiusMeters(accuracyMeters, config, office);
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
