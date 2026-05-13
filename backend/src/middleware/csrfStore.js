const crypto = require('crypto');

const store = new Map();
const TTL_MS = 60 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (v.exp < now) store.delete(k);
  }
}

function createPair() {
  prune();
  const sid = crypto.randomBytes(24).toString('hex');
  const token = crypto.randomBytes(32).toString('hex');
  store.set(sid, { token, exp: Date.now() + TTL_MS });
  return { sid, token };
}

function verify(sid, headerToken) {
  if (!sid || !headerToken) return false;
  prune();
  const row = store.get(sid);
  if (!row || row.exp < Date.now()) return false;
  try {
    const a = Buffer.from(row.token, 'utf8');
    const b = Buffer.from(String(headerToken), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

module.exports = { createPair, verify };
