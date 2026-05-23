const { query } = require('../db/pool');

class LoanRequestRepository {
  async create({ employeeId, loanAmount, monthlyDeduction, notes }) {
    const r = await query(
      `INSERT INTO loan_requests (employee_id, loan_amount, monthly_deduction, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [employeeId, loanAmount, monthlyDeduction, notes || null]
    );
    return r.rows[0];
  }

  async countPendingForEmployee(employeeId) {
    const r = await query(
      `SELECT COUNT(*)::int AS c FROM loan_requests
       WHERE employee_id = $1 AND approval_status = 'pending'`,
      [employeeId]
    );
    return r.rows[0].c;
  }

  async listForEmployee(employeeId) {
    const r = await query(
      `SELECT * FROM loan_requests WHERE employee_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [employeeId]
    );
    return r.rows;
  }

  async listDeductionsForLoan(loanRequestId) {
    const r = await query(
      `SELECT payroll_period, amount, created_at
       FROM loan_payroll_deductions
       WHERE loan_request_id = $1
       ORDER BY payroll_period ASC`,
      [loanRequestId]
    );
    return r.rows;
  }

  async listPending() {
    const r = await query(
      `SELECT l.*, e.full_name, e.employee_id AS employee_code
       FROM loan_requests l
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
       FROM loan_requests l
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
       FROM loan_requests l
       JOIN employees e ON e.id = l.employee_id
       WHERE l.id = $1`,
      [id]
    );
    return r.rows[0] || null;
  }

  async setDecision(id, { status, decidedBy, rejectionReason }) {
    const r = await query(
      `UPDATE loan_requests SET
        approval_status = $2,
        decided_by = $3,
        decided_at = NOW(),
        rejection_reason = $4,
        remaining_balance = CASE WHEN $2 = 'approved' THEN loan_amount ELSE NULL END
       WHERE id = $1 AND approval_status = 'pending'
       RETURNING *`,
      [id, status, decidedBy, rejectionReason || null]
    );
    return r.rows[0] || null;
  }

  async countActiveForEmployee(employeeId) {
    const r = await query(
      `SELECT COUNT(*)::int AS c FROM loan_requests
       WHERE employee_id = $1 AND approval_status = 'approved'
         AND COALESCE(remaining_balance, 0) > 0`,
      [employeeId]
    );
    return r.rows[0].c;
  }

  async findActiveForEmployee(employeeId) {
    const r = await query(
      `SELECT * FROM loan_requests
       WHERE employee_id = $1 AND approval_status = 'approved'
         AND COALESCE(remaining_balance, 0) > 0
       ORDER BY decided_at ASC NULLS LAST, id ASC
       LIMIT 1`,
      [employeeId]
    );
    return r.rows[0] || null;
  }

  async findDeductionForPeriod(loanRequestId, payrollPeriod) {
    const r = await query(
      `SELECT amount FROM loan_payroll_deductions
       WHERE loan_request_id = $1 AND payroll_period = $2`,
      [loanRequestId, payrollPeriod]
    );
    return r.rows[0] || null;
  }

  async recordPayrollDeduction({ loanRequestId, payrollPeriod, amount }) {
    const amt = Number(amount) || 0;
    if (amt <= 0) return null;
    const existing = await this.findDeductionForPeriod(loanRequestId, payrollPeriod);
    if (existing) return existing;

    await query(
      `INSERT INTO loan_payroll_deductions (loan_request_id, payroll_period, amount)
       VALUES ($1, $2, $3)`,
      [loanRequestId, payrollPeriod, amt]
    );
    const r = await query(
      `UPDATE loan_requests SET
        remaining_balance = GREATEST(0, COALESCE(remaining_balance, loan_amount) - $2)
       WHERE id = $1
       RETURNING *`,
      [loanRequestId, amt]
    );
    return r.rows[0] || null;
  }
}

module.exports = { LoanRequestRepository };
