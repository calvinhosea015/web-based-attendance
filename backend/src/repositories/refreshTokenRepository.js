const crypto = require('crypto');
const { query } = require('../db/pool');

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw), 'utf8').digest('hex');
}

class RefreshTokenRepository {
  async create({ userId, rawToken, expiresAt, userAgent, ipAddress }) {
    const tokenHash = hashToken(rawToken);
    const r = await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, tokenHash, expiresAt, userAgent || null, ipAddress || null]
    );
    return r.rows[0].id;
  }

  async findValidByRaw(rawToken) {
    const tokenHash = hashToken(rawToken);
    const r = await query(
      `SELECT rt.*, u.username, u.role, u.employee_id
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > NOW()`,
      [tokenHash]
    );
    return r.rows[0] || null;
  }

  async revokeByRaw(rawToken) {
    const tokenHash = hashToken(rawToken);
    await query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash]
    );
  }

  async revokeAllForUser(userId) {
    await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [
      userId,
    ]);
  }
}

module.exports = { RefreshTokenRepository, hashToken };
