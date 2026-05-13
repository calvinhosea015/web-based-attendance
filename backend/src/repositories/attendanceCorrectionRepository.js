const { query } = require('../db/pool');

class AttendanceCorrectionRepository {
  async listPending() {
    const r = await query(
      `SELECT c.*, e.full_name, e.employee_id AS employee_code
       FROM attendance_correction_requests c
       JOIN employees e ON e.id = c.employee_id
       WHERE c.approval_status = 'pending'
       ORDER BY c.created_at DESC`
    );
    return r.rows;
  }

  async setDecision(id, { status, decidedBy }) {
    const r = await query(
      `UPDATE attendance_correction_requests SET
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

module.exports = { AttendanceCorrectionRepository };
