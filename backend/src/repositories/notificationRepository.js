const { query } = require('../db/pool');

class NotificationRepository {
  async listAdminRecent(limit = 50) {
    const r = await query(
      `SELECT * FROM notifications
       WHERE scope = 'admin'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return r.rows;
  }

  async listForUser(userId, limit = 50) {
    const r = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return r.rows;
  }

  async insertAdminAlert({ type, title, body, payload }) {
    await query(
      `INSERT INTO notifications (scope, user_id, type, title, body, payload)
       VALUES ('admin', NULL, $1, $2, $3, $4::jsonb)`,
      [type, title, body || '', JSON.stringify(payload || {})]
    );
  }

  async markRead(id) {
    await query(`UPDATE notifications SET read_at = NOW() WHERE id = $1`, [id]);
  }
}

module.exports = { NotificationRepository };
