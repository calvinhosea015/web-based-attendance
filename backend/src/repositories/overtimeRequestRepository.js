const { query } = require('../db/pool');

class OvertimeRequestRepository {
  async listPending() {
    const r = await query(
      `SELECT o.*, e.full_name, e.employee_id AS employee_code
       FROM overtime_requests o
       JOIN employees e ON e.id = o.employee_id
       WHERE o.approval_status = 'pending'
       ORDER BY o.created_at DESC`
    );
    return r.rows;
  }

  async setDecision(id, { status, decidedBy }) {
    const r = await query(
      `UPDATE overtime_requests SET
        approval_status = $2,
        decided_by = $3,
        decided_at = NOW()
       WHERE id = $1 AND approval_status = 'pending'
       RETURNING *`,
      [id, status, decidedBy]
    );
    return r.rows[0] || null;
  }
}

module.exports = { OvertimeRequestRepository };
