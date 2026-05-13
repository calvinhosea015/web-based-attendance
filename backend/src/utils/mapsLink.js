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

function parseMapsLink(link) {
  if (!link) return null;
  const trimmed = link.trim();
  const patterns = [
    /@([-\d.]+),([-\d.]+)/,
    /[?&]q=([-\d.]+),([-\d.]+)/,
    /!3d([-\d.]+)!4d([-\d.]+)/,
    /\/place\/.*\/([-\d.]+),([-\d.]+)(?:\/|$)/,
    /\/search\/.*@([-\d.]+),([-\d.]+)/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
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
