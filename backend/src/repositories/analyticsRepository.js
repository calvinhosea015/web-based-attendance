const { query } = require('../db/pool');

class AnalyticsRepository {
  async monthlyAttendance(year, month) {
    const r = await query(
      `SELECT attendance_status, COUNT(*)::int AS cnt
       FROM attendance
       WHERE EXTRACT(YEAR FROM check_in) = $1 AND EXTRACT(MONTH FROM check_in) = $2
       GROUP BY attendance_status`,
      [year, month]
    );
    return r.rows;
  }

  async departmentAttendance(fromDate, toDate) {
    const r = await query(
      `SELECT COALESCE(d.name, 'Unassigned') AS department,
        COUNT(*)::int AS attendance_rows,
        SUM(COALESCE(a.work_hours, 0))::numeric AS total_work_hours
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE a.check_in::date >= $1::date AND a.check_in::date <= $2::date
       GROUP BY d.name
       ORDER BY department`,
      [fromDate, toDate]
    );
    return r.rows;
  }

  async overtimeTrends(months) {
    const r = await query(
      `SELECT date_trunc('month', check_in)::date AS month,
        SUM(COALESCE(overtime_hours, 0))::numeric AS overtime_hours
       FROM attendance
       WHERE check_in >= date_trunc('month', CURRENT_DATE) - ($1::int * interval '1 month')
       GROUP BY 1
       ORDER BY month`,
      [months]
    );
    return r.rows;
  }

  async payrollTrends(limit) {
    const r = await query(
      `SELECT payroll_period,
        SUM(final_salary)::numeric AS total_final,
        COUNT(*)::int AS employees
       FROM payroll
       GROUP BY payroll_period
       ORDER BY payroll_period DESC
       LIMIT $1`,
      [limit]
    );
    return r.rows;
  }
}

module.exports = { AnalyticsRepository };
