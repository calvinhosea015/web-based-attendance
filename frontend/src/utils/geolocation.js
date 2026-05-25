/**
 * Read device position with a high-accuracy attempt first, then a network/cell fallback.
 * Permission denied (code 1) is not retried.
 */
export function readPosition(options = {}) {
  const { timeoutMs = 25000, maximumAgeMs = 0 } = options;

  const tryGet = (enableHighAccuracy, timeout) =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(Object.assign(new Error('unsupported'), { code: 0 }));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy,
        timeout,
        maximumAge: maximumAgeMs,
      });
    });

  const highTimeout = Math.min(timeoutMs, 12000);
  return tryGet(true, highTimeout).catch((err) => {
    if (err?.code === 1) throw err;
    return tryGet(false, timeoutMs);
  });
}

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function geoMessage(err) {
  if (!err) return 'geoUnavailable';
  if (err.code === 0) return 'geoUnsupported';
  if (err.code === 1) return 'geoPermissionDenied';
  if (err.code === 2) return 'geoUnavailable';
  if (err.code === 3) return 'geoTimeout';
  return null;
}
