const { pool, query } = require('../db/pool');

class LoanRequestRepository {
  async create({ employeeId, loanAmount, monthlyDeduction, repaymentStartPeriod, notes }) {
    const r = await query(
      `INSERT INTO loan_requests (
        employee_id, loan_amount, monthly_deduction, repayment_start_period, notes
      ) VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [employeeId, loanAmount, monthlyDeduction, repaymentStartPeriod, notes || null]
    );
    return r.rows[0];
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
        approval_status = $2::varchar,
        decided_by = $3,
        decided_at = NOW(),
        rejection_reason = $4,
        remaining_balance = CASE WHEN $2::varchar = 'approved' THEN loan_amount ELSE NULL END
       WHERE id = $1 AND approval_status = 'pending'
       RETURNING *`,
      [id, status, decidedBy, rejectionReason || null]
    );
    return r.rows[0] || null;
  }

  /**
   * Loans that contribute to one payroll period. A recorded final instalment
   * is retained even after its balance reaches zero, so regenerating that
   * payroll period cannot erase the deduction.
   */
  async listEligibleForPayroll(employeeId, payrollPeriod) {
    const r = await query(
      `SELECT l.*, d.amount AS recorded_deduction
       FROM loan_requests l
       LEFT JOIN loan_payroll_deductions d
         ON d.loan_request_id = l.id AND d.payroll_period = $2
       WHERE l.employee_id = $1
         AND l.approval_status = 'approved'
         AND (
           d.id IS NOT NULL
           OR (
             COALESCE(l.remaining_balance, l.loan_amount, 0) > 0
             AND (
               l.repayment_start_period IS NULL
               OR l.repayment_start_period <= $2
             )
           )
         )
       ORDER BY l.decided_at ASC NULLS LAST, l.id ASC`,
      [employeeId, payrollPeriod]
    );
    return r.rows;
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
    const requestedAmount = Number(amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) return null;

    // Keep the per-period ledger and loan balance in one transaction. The row
    // lock also makes a repeated Generate request idempotent under concurrency.
    const client = await pool.connect();
    let began = false;
    try {
      await client.query('BEGIN');
      began = true;

      const locked = await client.query(
        `SELECT id, loan_amount, remaining_balance
         FROM loan_requests
         WHERE id = $1
         FOR UPDATE`,
        [loanRequestId]
      );
      const loan = locked.rows[0];
      if (!loan) {
        await client.query('COMMIT');
        began = false;
        return null;
      }

      const existing = await client.query(
        `SELECT amount FROM loan_payroll_deductions
         WHERE loan_request_id = $1 AND payroll_period = $2`,
        [loanRequestId, payrollPeriod]
      );
      if (existing.rows[0]) {
        await client.query('COMMIT');
        began = false;
        return { amount: Number(existing.rows[0].amount) || 0, alreadyRecorded: true };
      }

      const rawRemaining = Number(loan.remaining_balance ?? loan.loan_amount);
      const remaining = Number.isFinite(rawRemaining) ? Math.max(0, rawRemaining) : 0;
      const deductionAmount = Math.min(requestedAmount, remaining);
      if (deductionAmount <= 0) {
        await client.query('COMMIT');
        began = false;
        return null;
      }

      const inserted = await client.query(
        `INSERT INTO loan_payroll_deductions (loan_request_id, payroll_period, amount)
         VALUES ($1, $2, $3)
         ON CONFLICT (loan_request_id, payroll_period) DO NOTHING
         RETURNING amount`,
        [loanRequestId, payrollPeriod, deductionAmount]
      );
      if (!inserted.rows[0]) {
        const recorded = await client.query(
          `SELECT amount FROM loan_payroll_deductions
           WHERE loan_request_id = $1 AND payroll_period = $2`,
          [loanRequestId, payrollPeriod]
        );
        await client.query('COMMIT');
        began = false;
        return recorded.rows[0]
          ? { amount: Number(recorded.rows[0].amount) || 0, alreadyRecorded: true }
          : null;
      }

      const updated = await client.query(
        `UPDATE loan_requests SET
          remaining_balance = GREATEST(0, COALESCE(remaining_balance, loan_amount) - $2)
         WHERE id = $1
         RETURNING *`,
        [loanRequestId, deductionAmount]
      );
      await client.query('COMMIT');
      began = false;
      return updated.rows[0]
        ? { amount: deductionAmount, loan: updated.rows[0], alreadyRecorded: false }
        : null;
    } catch (err) {
      if (began) await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = { LoanRequestRepository };
