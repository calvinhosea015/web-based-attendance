const { query } = require('../db/pool');

class PayrollRepository {
  async summaryRecent(limit = 12) {
    const r = await query(
      `SELECT payroll_period,
        SUM(final_salary)::numeric AS total_final,
        COUNT(*)::int AS rows
       FROM payroll
       GROUP BY payroll_period
       ORDER BY payroll_period DESC
       LIMIT $1`,
      [limit]
    );
    return r.rows;
  }

  async listForEmployee(employeeId) {
    const r = await query(
      `SELECT * FROM payroll WHERE employee_id = $1 ORDER BY period_end DESC LIMIT 24`,
      [employeeId]
    );
    return r.rows;
  }
}

module.exports = { PayrollRepository };
