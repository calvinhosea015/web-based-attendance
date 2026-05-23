const { query } = require('../db/pool');

class PayrollRepository {
  async getSettings() {
    const r = await query(`SELECT transport_amount, diligence_amount, updated_at FROM payroll_settings WHERE id = 1`);
    return (
      r.rows[0] || {
        transport_amount: 250000,
        diligence_amount: 100000,
      }
    );
  }

  async updateSettings({ transport_amount, diligence_amount }) {
    const r = await query(
      `UPDATE payroll_settings
       SET transport_amount = COALESCE($1, transport_amount),
           diligence_amount = COALESCE($2, diligence_amount),
           updated_at = NOW()
       WHERE id = 1
       RETURNING transport_amount, diligence_amount, updated_at`,
      [transport_amount ?? null, diligence_amount ?? null]
    );
    return r.rows[0];
  }

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

  async listByPeriod(payrollPeriod) {
    const r = await query(
      `SELECT p.*,
        e.employee_id AS employee_code,
        e.full_name,
        e.upah_harian AS employee_upah_harian,
        e.tunjangan_masa_kerja AS employee_tunjangan_masa_kerja,
        e.transport_eligible AS employee_transport_eligible,
        e.transport_allowance_amount AS employee_transport_allowance_amount,
        e.diligence_allowance_amount AS employee_diligence_allowance_amount
       FROM payroll p
       JOIN employees e ON e.id = p.employee_id
       WHERE p.payroll_period = $1
       ORDER BY e.full_name ASC`,
      [payrollPeriod]
    );
    return r.rows;
  }

  async findByPeriodAndEmployee(payrollPeriod, employeeId) {
    const r = await query(
      `SELECT p.*, e.employee_id AS employee_code, e.full_name
       FROM payroll p
       JOIN employees e ON e.id = p.employee_id
       WHERE p.payroll_period = $1 AND p.employee_id = $2`,
      [payrollPeriod, employeeId]
    );
    return r.rows[0] || null;
  }

  async countDaysAttended(employeeId, periodStart, periodEnd) {
    const r = await query(
      `SELECT COUNT(DISTINCT check_in::date)::int AS days_n
       FROM attendance
       WHERE employee_id = $1
         AND check_in::date >= $2::date
         AND check_in::date <= $3::date`,
      [employeeId, periodStart, periodEnd]
    );
    return r.rows[0]?.days_n ?? 0;
  }

  async upsertRow(row, exec = query) {
    const r = await exec(
      `INSERT INTO payroll (
        employee_id, payroll_period, period_start, period_end,
        upah_harian, basic_salary, days_attended,
        tunjangan_masa_kerja, transport_eligible, transport_allowance,
        overtime_pay, insentif, diligence_eligible, diligence_bonus,
        bonus_omset, loan_deduction, other_deductions, deductions, allowances, final_salary
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      )
      ON CONFLICT (employee_id, payroll_period) DO UPDATE SET
        period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end,
        upah_harian = EXCLUDED.upah_harian,
        basic_salary = EXCLUDED.basic_salary,
        days_attended = EXCLUDED.days_attended,
        tunjangan_masa_kerja = EXCLUDED.tunjangan_masa_kerja,
        transport_eligible = EXCLUDED.transport_eligible,
        transport_allowance = EXCLUDED.transport_allowance,
        overtime_pay = EXCLUDED.overtime_pay,
        insentif = EXCLUDED.insentif,
        diligence_eligible = EXCLUDED.diligence_eligible,
        diligence_bonus = EXCLUDED.diligence_bonus,
        bonus_omset = EXCLUDED.bonus_omset,
        loan_deduction = EXCLUDED.loan_deduction,
        other_deductions = EXCLUDED.other_deductions,
        deductions = EXCLUDED.deductions,
        allowances = EXCLUDED.allowances,
        final_salary = EXCLUDED.final_salary
      RETURNING *`,
      [
        row.employee_id,
        row.payroll_period,
        row.period_start,
        row.period_end,
        row.upah_harian,
        row.basic_salary,
        row.days_attended,
        row.tunjangan_masa_kerja,
        row.transport_eligible,
        row.transport_allowance,
        row.overtime_pay,
        row.insentif,
        row.diligence_eligible,
        row.diligence_bonus,
        row.bonus_omset,
        row.loan_deduction ?? 0,
        row.other_deductions ?? 0,
        row.deductions,
        row.allowances,
        row.final_salary,
      ]
    );
    return r.rows[0];
  }

  async listActiveEmployeesForPayroll() {
    const r = await query(
      `SELECT id, employee_id AS employee_code, full_name, upah_harian,
              tunjangan_masa_kerja, transport_eligible,
              transport_allowance_amount, diligence_allowance_amount, join_date
       FROM employees
       WHERE status = 'active'
       ORDER BY full_name ASC`
    );
    return r.rows;
  }
}

module.exports = { PayrollRepository };
