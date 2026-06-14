const { query } = require('../db/pool');
const config = require('../config/env');

class PayrollRepository {
  async getSettings() {
    const r = await query(
      `SELECT transport_amount, diligence_amount, default_upah_harian, updated_at FROM payroll_settings WHERE id = 1`
    );
    return (
      r.rows[0] || {
        transport_amount: 250000,
        diligence_amount: 100000,
        default_upah_harian: 0,
      }
    );
  }

  async updateSettings({ transport_amount, diligence_amount, default_upah_harian }) {
    const r = await query(
      `UPDATE payroll_settings
       SET transport_amount = COALESCE($1, transport_amount),
           diligence_amount = COALESCE($2, diligence_amount),
           default_upah_harian = COALESCE($3, default_upah_harian),
           updated_at = NOW()
       WHERE id = 1
       RETURNING transport_amount, diligence_amount, default_upah_harian, updated_at`,
      [transport_amount ?? null, diligence_amount ?? null, default_upah_harian ?? null]
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
        e.join_date,
        e.upah_harian AS employee_upah_harian,
        e.basic_salary AS employee_basic_salary,
        e.tunjangan_masa_kerja AS employee_tunjangan_masa_kerja,
        e.transport_eligible AS employee_transport_eligible,
        e.transport_allowance_amount AS employee_transport_allowance_amount,
        e.diligence_allowance_amount AS employee_diligence_allowance_amount,
        d.name AS department_name,
        pos.title AS position_title,
        u.role AS user_role
       FROM payroll p
       JOIN employees e ON e.id = p.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN positions pos ON pos.id = e.position_id
       INNER JOIN users u ON u.employee_id = e.id
       WHERE p.payroll_period = $1 AND e.status = 'active'
       ORDER BY e.full_name ASC`,
      [payrollPeriod]
    );
    return r.rows;
  }

  async deleteAllForEmployee(employeeId, exec = query) {
    await exec(`DELETE FROM payroll WHERE employee_id = $1`, [employeeId]);
  }

  /** Remove payroll rows for a period that are not in the active employee id set. */
  async deleteForPeriodExceptEmployees(payrollPeriod, employeeIds, exec = query) {
    const ids = (employeeIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0);
    if (!ids.length) {
      await exec(`DELETE FROM payroll WHERE payroll_period = $1`, [payrollPeriod]);
      return;
    }
    await exec(
      `DELETE FROM payroll
       WHERE payroll_period = $1
         AND NOT (employee_id = ANY($2::int[]))`,
      [payrollPeriod, ids]
    );
  }

  async findByPeriodAndEmployee(payrollPeriod, employeeId) {
    const r = await query(
      `SELECT p.*,
        e.employee_id AS employee_code,
        e.full_name,
        e.join_date,
        e.upah_harian AS employee_upah_harian,
        e.transport_eligible AS employee_transport_eligible,
        e.transport_allowance_amount AS employee_transport_allowance_amount,
        e.diligence_allowance_amount AS employee_diligence_allowance_amount,
        d.name AS department_name,
        pos.title AS position_title,
        u.role AS user_role
       FROM payroll p
       JOIN employees e ON e.id = p.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN positions pos ON pos.id = e.position_id
       INNER JOIN users u ON u.employee_id = e.id
       WHERE p.payroll_period = $1 AND p.employee_id = $2`,
      [payrollPeriod, employeeId]
    );
    return r.rows[0] || null;
  }

  /**
   * Distinct check-in calendar days from attendance in the pay period.
   * @param {boolean} [monSatOnly] — Staff Kantor: count Mon–Sat only (matches required-day rules).
   */
  async countDaysAttendedFromAttendance(employeeId, periodStart, periodEnd, monSatOnly = false) {
    const tz = config.attendanceCalendarTz || 'Asia/Jakarta';
    const dowClause = monSatOnly
      ? 'AND EXTRACT(DOW FROM check_in AT TIME ZONE $4) BETWEEN 1 AND 6'
      : '';
    const r = await query(
      `SELECT COUNT(DISTINCT (check_in AT TIME ZONE $4)::date)::int AS days_n
       FROM attendance
       WHERE employee_id = $1
         AND (check_in AT TIME ZONE $4)::date >= $2::date
         AND (check_in AT TIME ZONE $4)::date <= $3::date
         ${dowClause}`,
      [employeeId, periodStart, periodEnd, tz]
    );
    return r.rows[0]?.days_n ?? 0;
  }

  async countDaysAttended(employeeId, periodStart, periodEnd) {
    return this.countDaysAttendedFromAttendance(employeeId, periodStart, periodEnd, false);
  }

  async countDaysAttendedMonSat(employeeId, periodStart, periodEnd) {
    return this.countDaysAttendedFromAttendance(employeeId, periodStart, periodEnd, true);
  }

  /** Distinct check-in dates (YYYY-MM-DD) in the pay period. */
  async listAttendanceDatesInPeriod(employeeId, periodStart, periodEnd, monSatOnly = false) {
    const tz = config.attendanceCalendarTz || 'Asia/Jakarta';
    const dowClause = monSatOnly
      ? 'AND EXTRACT(DOW FROM check_in AT TIME ZONE $4) BETWEEN 1 AND 6'
      : '';
    const r = await query(
      `SELECT DISTINCT (check_in AT TIME ZONE $4)::date AS d
       FROM attendance
       WHERE employee_id = $1
         AND (check_in AT TIME ZONE $4)::date >= $2::date
         AND (check_in AT TIME ZONE $4)::date <= $3::date
         ${dowClause}
       ORDER BY d`,
      [employeeId, periodStart, periodEnd, tz]
    );
    return r.rows.map((row) => {
      const d = row.d;
      if (typeof d === 'string') return d.slice(0, 10);
      if (d instanceof Date) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      return String(d).slice(0, 10);
    });
  }

  async getRoleForEmployee(employeeId) {
    const r = await query(`SELECT role FROM users WHERE employee_id = $1 LIMIT 1`, [employeeId]);
    return r.rows[0]?.role || null;
  }

  async upsertRow(row, exec = query) {
    const r = await exec(
      `INSERT INTO payroll (
        employee_id, payroll_period, period_start, period_end,
        upah_harian, basic_salary, days_attended, expected_work_days,
        tunjangan_masa_kerja, transport_eligible, transport_allowance,
        overtime_pay, insentif, diligence_eligible, diligence_bonus,
        bonus_omset, omset_total, loan_deduction, late_deduction, pph_21, other_deductions,
        absence_deduction, bpjs_tk, bpjs_kes,
        deductions, allowances, final_salary, keterangan
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
      )
      ON CONFLICT (employee_id, payroll_period) DO UPDATE SET
        period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end,
        upah_harian = EXCLUDED.upah_harian,
        basic_salary = EXCLUDED.basic_salary,
        days_attended = EXCLUDED.days_attended,
        expected_work_days = EXCLUDED.expected_work_days,
        tunjangan_masa_kerja = EXCLUDED.tunjangan_masa_kerja,
        transport_eligible = EXCLUDED.transport_eligible,
        transport_allowance = EXCLUDED.transport_allowance,
        overtime_pay = EXCLUDED.overtime_pay,
        insentif = EXCLUDED.insentif,
        diligence_eligible = EXCLUDED.diligence_eligible,
        diligence_bonus = EXCLUDED.diligence_bonus,
        bonus_omset = EXCLUDED.bonus_omset,
        omset_total = EXCLUDED.omset_total,
        loan_deduction = EXCLUDED.loan_deduction,
        late_deduction = EXCLUDED.late_deduction,
        pph_21 = EXCLUDED.pph_21,
        other_deductions = EXCLUDED.other_deductions,
        absence_deduction = EXCLUDED.absence_deduction,
        bpjs_tk = EXCLUDED.bpjs_tk,
        bpjs_kes = EXCLUDED.bpjs_kes,
        deductions = EXCLUDED.deductions,
        allowances = EXCLUDED.allowances,
        final_salary = EXCLUDED.final_salary,
        keterangan = EXCLUDED.keterangan
      RETURNING *`,
      [
        row.employee_id,
        row.payroll_period,
        row.period_start,
        row.period_end,
        row.upah_harian,
        row.basic_salary,
        row.days_attended,
        row.expected_work_days ?? null,
        row.tunjangan_masa_kerja,
        row.transport_eligible,
        row.transport_allowance,
        row.overtime_pay,
        row.insentif,
        row.diligence_eligible,
        row.diligence_bonus,
        row.bonus_omset,
        row.omset_total ?? 0,
        row.loan_deduction ?? 0,
        row.late_deduction ?? 0,
        row.pph_21 ?? 0,
        row.other_deductions ?? 0,
        row.absence_deduction ?? null,
        row.bpjs_tk ?? 0,
        row.bpjs_kes ?? 0,
        row.deductions,
        row.allowances,
        row.final_salary,
        row.keterangan ?? '',
      ]
    );
    return r.rows[0];
  }

  async listActiveEmployeesForPayroll() {
    const r = await query(
      `SELECT e.id, e.employee_id AS employee_code, e.full_name, e.upah_harian, e.basic_salary,
              e.tunjangan_masa_kerja, e.transport_eligible,
              e.transport_allowance_amount, e.diligence_allowance_amount, e.join_date,
              u.role AS user_role
       FROM employees e
       INNER JOIN users u ON u.employee_id = e.id
       WHERE e.status = 'active'
       ORDER BY e.full_name ASC`
    );
    return r.rows;
  }
}

module.exports = { PayrollRepository };
