const { query } = require('../db/pool');

class LeaveRepository {
  async balances(employeeId) {
    const r = await query(
      `SELECT leave_type, balance_days FROM leave_balances WHERE employee_id = $1 ORDER BY leave_type`,
      [employeeId]
    );
    return r.rows;
  }

  async listForEmployee(employeeId) {
    const r = await query(
      `SELECT * FROM leave_requests WHERE employee_id = $1 ORDER BY start_date DESC LIMIT 50`,
      [employeeId]
    );
    return r.rows;
  }

  async createRequest({ employeeId, leaveType, startDate, endDate, daysCount }) {
    const r = await query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, approval_status, days_count)
       VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING *`,
      [employeeId, leaveType, startDate, endDate, daysCount]
    );
    return r.rows[0];
  }

  async listPendingAdmin() {
    const r = await query(
      `SELECT lr.*, e.full_name, e.employee_id AS employee_code
       FROM leave_requests lr
       JOIN employees e ON e.id = lr.employee_id
       WHERE lr.approval_status = 'pending'
       ORDER BY lr.created_at DESC`
    );
    return r.rows;
  }

  async setApproval(id, { status, approverUserId, rejectionReason }) {
    const r = await query(
      `UPDATE leave_requests SET
        approval_status = $2,
        approved_by = $3,
        approved_at = NOW(),
        rejection_reason = CASE WHEN $2 = 'rejected' THEN $4 ELSE NULL END
       WHERE id = $1 AND approval_status = 'pending'
       RETURNING *`,
      [id, status, approverUserId, rejectionReason || null]
    );
    return r.rows[0] || null;
  }
}

module.exports = { LeaveRepository };
