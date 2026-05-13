const { query } = require('../db/pool');

class AuditLogRepository {
  async logSecurity({
    actorUserId,
    action,
    resourceType,
    resourceId,
    details,
    ip,
    userAgent,
  }) {
    await query(
      `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        actorUserId || null,
        action,
        resourceType || null,
        resourceId || null,
        JSON.stringify(details || {}),
        ip || null,
        userAgent || null,
      ]
    );
  }

  async logActivity({ userId, method, path, statusCode, ip, userAgent, durationMs }) {
    await query(
      `INSERT INTO activity_logs (user_id, method, path, status_code, ip_address, user_agent, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, method, path, statusCode, ip || null, userAgent || null, durationMs ?? null]
    );
  }

  async listAudit({ limit = 100, offset = 0 }) {
    const r = await query(
      `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return r.rows;
  }

  async listActivity({ limit = 200, offset = 0 }) {
    const r = await query(
      `SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return r.rows;
  }
}

module.exports = { AuditLogRepository };
