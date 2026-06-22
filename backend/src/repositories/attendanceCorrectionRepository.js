const { query } = require('../db/pool');

class AttendanceCorrectionRepository {
  async findById(id) {
    const r = await query(`SELECT * FROM attendance_correction_requests WHERE id = $1`, [id]);
    return r.rows[0] || null;
  }

  async hasPendingForAttendance(attendanceId) {
    const r = await query(
      `SELECT 1 FROM attendance_correction_requests
       WHERE attendance_id = $1 AND approval_status = 'pending' LIMIT 1`,
      [attendanceId]
    );
    return r.rowCount > 0;
  }

  async create({ employeeId, attendanceId, reason, requestedChanges }) {
    const r = await query(
      `INSERT INTO attendance_correction_requests
        (employee_id, attendance_id, reason, requested_changes)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING *`,
      [employeeId, attendanceId, reason, JSON.stringify(requestedChanges || {})]
    );
    return r.rows[0];
  }

  async listByEmployee(employeeId) {
    const r = await query(
      `SELECT c.*, a.check_in AS current_check_in, a.check_out AS current_check_out,
              o.name AS office_name
       FROM attendance_correction_requests c
       JOIN attendance a ON a.id = c.attendance_id
       JOIN offices o ON o.id = a.office_id
       WHERE c.employee_id = $1
       ORDER BY c.created_at DESC
       LIMIT 50`,
      [employeeId]
    );
    return r.rows;
  }

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
