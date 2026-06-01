const { query } = require('../db/pool');

class LeaveRequestRepository {
  async create({
    employeeId,
    leaveType,
    startDate,
    endDate,
    daysCount,
    attachmentPath,
    attachmentData,
    attachmentMime,
    reason,
  }) {
    const r = await query(
      `INSERT INTO leave_requests
        (employee_id, leave_type, start_date, end_date, days_count,
         attachment_path, attachment_data, attachment_mime, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        employeeId,
        leaveType,
        startDate,
        endDate,
        daysCount,
        attachmentPath || null,
        attachmentData || null,
        attachmentMime || null,
        reason || null,
      ]
    );
    return r.rows[0];
  }

  async countPendingForEmployee(employeeId) {
    const r = await query(
      `SELECT COUNT(*)::int AS c FROM leave_requests
       WHERE employee_id = $1 AND approval_status = 'pending'`,
      [employeeId]
    );
    return r.rows[0].c;
  }

  async sumApprovedDaysInYear(employeeId, leaveType, year) {
    const r = await query(
      `SELECT COALESCE(SUM(days_count), 0)::float AS total
       FROM leave_requests
       WHERE employee_id = $1
         AND leave_type = $2
         AND approval_status = 'approved'
         AND EXTRACT(YEAR FROM start_date) = $3`,
      [employeeId, leaveType, year]
    );
    return Number(r.rows[0].total) || 0;
  }

  async hasOverlappingRequest(employeeId, startDate, endDate, excludeId = null) {
    const vals = [employeeId, startDate, endDate];
    let exclude = '';
    if (excludeId != null) {
      vals.push(excludeId);
      exclude = ` AND id <> $${vals.length}`;
    }
    const r = await query(
      `SELECT COUNT(*)::int AS c FROM leave_requests
       WHERE employee_id = $1
         AND approval_status IN ('pending', 'approved')
         AND start_date <= $3
         AND end_date >= $2
         ${exclude}`,
      vals
    );
    return r.rows[0].c > 0;
  }

  async listForEmployee(employeeId) {
    const r = await query(
      `SELECT * FROM leave_requests
       WHERE employee_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [employeeId]
    );
    return r.rows;
  }

  async listPending() {
    const r = await query(
      `SELECT l.*, e.full_name, e.employee_id AS employee_code
       FROM leave_requests l
       JOIN employees e ON e.id = l.employee_id
       WHERE l.approval_status = 'pending'
       ORDER BY l.created_at ASC`
    );
    return r.rows;
  }

  async listAll({ status, limit = 100 } = {}) {
    const vals = [];
    let where = '';
    if (status) {
      vals.push(status);
      where = `WHERE l.approval_status = $1`;
    }
    vals.push(limit);
    const r = await query(
      `SELECT l.*, e.full_name, e.employee_id AS employee_code
       FROM leave_requests l
       JOIN employees e ON e.id = l.employee_id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT $${vals.length}`,
      vals
    );
    return r.rows;
  }

  async findById(id) {
    const r = await query(
      `SELECT l.*, e.full_name, e.employee_id AS employee_code
       FROM leave_requests l
       JOIN employees e ON e.id = l.employee_id
       WHERE l.id = $1`,
      [id]
    );
    return r.rows[0] || null;
  }

  async findByAttachment(filename) {
    const r = await query(`SELECT * FROM leave_requests WHERE attachment_path = $1 LIMIT 1`, [
      filename,
    ]);
    return r.rows[0] || null;
  }

  async setDecision(id, { status, approvedBy, rejectionReason, isPaid }) {
    const r = await query(
      `UPDATE leave_requests SET
        approval_status = $2::varchar,
        approved_by = $3,
        approved_at = NOW(),
        rejection_reason = $4,
        is_paid = CASE WHEN $2::varchar = 'approved' THEN $5 ELSE NULL END
       WHERE id = $1 AND approval_status = 'pending'
       RETURNING *`,
      [id, status, approvedBy, rejectionReason || null, isPaid]
    );
    return r.rows[0] || null;
  }

  async listApprovedPaidInPeriod(employeeId, periodStart, periodEnd) {
    const r = await query(
      `SELECT start_date, end_date
       FROM leave_requests
       WHERE employee_id = $1
         AND approval_status = 'approved'
         AND is_paid = true
         AND start_date <= $3::date
         AND end_date >= $2::date`,
      [employeeId, periodStart, periodEnd]
    );
    return r.rows;
  }
}

module.exports = { LeaveRequestRepository };
