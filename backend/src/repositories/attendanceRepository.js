const { query } = require('../db/pool');

class AttendanceRepository {
  async findOpenToday(employeeId, dayStr) {
    const r = await query(
      `SELECT * FROM attendance
       WHERE employee_id = $1 AND check_in::date = $2::date AND check_out IS NULL
       ORDER BY check_in DESC LIMIT 1`,
      [employeeId, dayStr]
    );
    return r.rows[0] || null;
  }

  async findAnyToday(employeeId, dayStr) {
    const r = await query(
      `SELECT * FROM attendance
       WHERE employee_id = $1 AND check_in::date = $2::date
       ORDER BY check_in DESC LIMIT 1`,
      [employeeId, dayStr]
    );
    return r.rows[0] || null;
  }

  async insertCheckIn(row) {
    const r = await query(
      `INSERT INTO attendance (
        employee_id, office_id, check_in, lat_in, lng_in,
        gps_accuracy_in_m, client_ts_in, ip_in, user_agent_in,
        attendance_status, late_minutes, validation_flags
      ) VALUES (
        $1,$2,NOW(),$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb
      ) RETURNING *`,
      [
        row.employeeId,
        row.officeId,
        row.latIn,
        row.lngIn,
        row.gpsAccuracyInM,
        row.clientTsIn,
        row.ipIn,
        row.userAgentIn,
        row.attendanceStatus,
        row.lateMinutes,
        JSON.stringify(row.validationFlags || {}),
      ]
    );
    return r.rows[0];
  }

  async checkoutRow(id, row) {
    const r = await query(
      `UPDATE attendance SET
        check_out = NOW(),
        lat_out = $2,
        lng_out = $3,
        gps_accuracy_out_m = $4,
        client_ts_out = $5,
        ip_out = $6,
        user_agent_out = $7,
        work_hours = $8,
        overtime_hours = $9,
        attendance_status = $10,
        validation_flags = COALESCE(validation_flags, '{}'::jsonb) || $11::jsonb
      WHERE id = $1 AND check_out IS NULL
      RETURNING *`,
      [
        id,
        row.latOut,
        row.lngOut,
        row.gpsAccuracyOutM,
        row.clientTsOut,
        row.ipOut,
        row.userAgentOut,
        row.workHours,
        row.overtimeHours,
        row.attendanceStatus,
        JSON.stringify(row.validationFlagsOut || {}),
      ]
    );
    return r.rows[0] || null;
  }

  async listAllWithJoins() {
    const r = await query(
      `SELECT a.*, e.full_name, e.employee_id AS employee_code, o.name AS office_name
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       JOIN offices o ON o.id = a.office_id
       ORDER BY a.check_in DESC`
    );
    return r.rows;
  }

  async listForEmployee(employeeId, limit = 60) {
    const r = await query(
      `SELECT a.*, o.name AS office_name
       FROM attendance a
       JOIN offices o ON o.id = a.office_id
       WHERE a.employee_id = $1
       ORDER BY a.check_in DESC
       LIMIT $2`,
      [employeeId, limit]
    );
    return r.rows;
  }

  async lastCompletedLocation(employeeId) {
    const r = await query(
      `SELECT lat_out AS lat, lng_out AS lng, client_ts_out AS ts, check_out
       FROM attendance
       WHERE employee_id = $1 AND check_out IS NOT NULL AND lat_out IS NOT NULL
       ORDER BY check_out DESC LIMIT 1`,
      [employeeId]
    );
    return r.rows[0] || null;
  }

  async statsForDay(dayStr) {
    const r = await query(
      `SELECT
         attendance_status,
         COUNT(*)::int AS c
       FROM attendance
       WHERE check_in::date = $1::date
       GROUP BY attendance_status`,
      [dayStr]
    );
    return r.rows;
  }

  async seriesLastDays(days) {
    const r = await query(
      `SELECT check_in::date AS d,
        SUM(CASE WHEN attendance_status IN ('PRESENT','REMOTE_WORK','OVERTIME','HALF_DAY') THEN 1 ELSE 0 END)::int AS present_like,
        SUM(CASE WHEN attendance_status = 'LATE' THEN 1 ELSE 0 END)::int AS late_cnt
       FROM attendance
       WHERE check_in::date >= CURRENT_DATE - $1::integer
       GROUP BY check_in::date
       ORDER BY d`,
      [days]
    );
    return r.rows;
  }

  async todayRollup() {
    const r = await query(
      `SELECT
        COUNT(*) FILTER (WHERE attendance_status = 'LATE')::int AS late_cnt,
        COUNT(*) FILTER (WHERE attendance_status IN ('PRESENT','REMOTE_WORK','HALF_DAY','OVERTIME'))::int AS present_like_cnt,
        COUNT(DISTINCT employee_id)::int AS distinct_checked_in
       FROM attendance
       WHERE check_in::date = CURRENT_DATE`
    );
    return r.rows[0];
  }

  async sumWorkHoursThisWeek(employeeId) {
    const r = await query(
      `SELECT COALESCE(SUM(work_hours), 0)::numeric AS total
       FROM attendance
       WHERE employee_id = $1 AND check_in >= date_trunc('week', CURRENT_TIMESTAMP)`,
      [employeeId]
    );
    return r.rows[0].total;
  }

  /** Enterprise professional report — all queries parameterized (SQL injection safe). */
  async professionalReport(dateFrom, dateTo) {
    const r = await query(
      `SELECT
        e.employee_id AS employee_id,
        u.username AS username,
        e.full_name AS full_name,
        COALESCE(d.name, '') AS department,
        a.check_in::date AS day,
        a.check_in AS check_in,
        a.check_out AS check_out,
        COALESCE(a.work_hours, 0) AS total_hours,
        COALESCE(a.overtime_hours, 0) AS overtime,
        COALESCE(a.late_minutes, 0) AS late_minutes,
        a.attendance_status AS attendance_status,
        o.name AS location,
        COALESCE(
          NULLIF(TRIM(COALESCE(a.user_agent_in, '')), ''),
          NULLIF(TRIM(COALESCE(a.user_agent_out, '')), ''),
          ''
        ) AS device_used
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       LEFT JOIN users u ON u.employee_id = e.id
       LEFT JOIN departments d ON d.id = e.department_id
       JOIN offices o ON o.id = a.office_id
       WHERE a.check_in::date >= $1::date AND a.check_in::date <= $2::date
       ORDER BY a.check_in DESC`,
      [dateFrom, dateTo]
    );
    return r.rows;
  }
}

module.exports = { AttendanceRepository };
