const crypto = require('crypto');
const config = require('../config/env');

const TTL_MS = 60 * 60 * 1000;

function sign(raw, exp) {
  return crypto
    .createHmac('sha256', config.cookieSecret)
    .update(`${raw}.${exp}`)
    .digest('hex');
}

/** Stateless CSRF token — works across Railway replicas and when third-party cookies are blocked. */
function createPair() {
  const raw = crypto.randomBytes(32).toString('hex');
  const exp = Date.now() + TTL_MS;
  const sig = sign(raw, exp);
  const token = `${raw}.${exp}.${sig}`;
  return { sid: token, token };
}

function verifyToken(token) {
  if (!token) return false;
  const parts = String(token).split('.');
  if (parts.length !== 3) return false;
  const [raw, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!raw || !Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = sign(raw, exp);
  try {
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** @param {string} [_sid] legacy in-memory id (ignored) @param {string} [headerToken] */
function verify(_sid, headerToken) {
  return verifyToken(headerToken);
}

module.exports = { createPair, verify, verifyToken };
