const http = require('http');
const https = require('https');

function resolveRedirect(urlToResolve, limit = 5) {
  return new Promise((resolve, reject) => {
    if (limit === 0) return reject(new Error('Too many redirects'));
    try {
      const urlObj = new URL(urlToResolve);
      const client = urlObj.protocol === 'https:' ? https : http;
      const req = client.request(
        {
          method: 'HEAD',
          host: urlObj.hostname,
          path: urlObj.pathname + (urlObj.search || ''),
          headers: { 'User-Agent': 'Mozilla/5.0' },
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const next = res.headers.location.startsWith('http')
              ? res.headers.location
              : `${urlObj.protocol}//${urlObj.hostname}${res.headers.location}`;
            resolve(resolveRedirect(next, limit - 1));
          } else {
            resolve(urlToResolve);
          }
        }
      );
      req.on('error', reject);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

function isValidCoord(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function parseMapsLink(link) {
  if (!link) return null;
  let trimmed = link.trim();
  try {
    trimmed = decodeURIComponent(trimmed);
  } catch {
    // keep original if malformed percent-encoding
  }
  const patterns = [
    /!3d([-\d.]+)!4d([-\d.]+)/,
    /@([-\d.]+),([-\d.]+)/,
    /[?&]q=([-\d.]+),([-\d.]+)/,
    /[?&]query=([-\d.]+),([-\d.]+)/,
    /[?&]ll=([-\d.]+),([-\d.]+)/,
    /[?&]center=([-\d.]+),([-\d.]+)/,
    /\/place\/.*\/([-\d.]+),([-\d.]+)(?:\/|$|\?|&)/,
    /\/search\/([-\d.]+),([-\d.]+)/,
    /\/dir\/\/([-\d.]+),([-\d.]+)/,
    /\/search\/.*@([-\d.]+),([-\d.]+)/,
    /^geo:([-\d.]+),([-\d.]+)/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (isValidCoord(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

async function getCoordinatesFromLink(link) {
  const direct = parseMapsLink(link);
  if (direct) return direct;
  const finalUrl = await resolveRedirect(link);
  return parseMapsLink(finalUrl);
}

module.exports = { getCoordinatesFromLink };
