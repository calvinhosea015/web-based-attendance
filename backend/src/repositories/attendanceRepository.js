const { query } = require('../db/pool');
const config = require('../config/env');

class AttendanceRepository {
  /** Any open session (check-out not set), regardless of calendar day. */
  async findOpenSession(employeeId) {
    const r = await query(
      `SELECT * FROM attendance
       WHERE employee_id = $1 AND check_out IS NULL
       ORDER BY check_in DESC LIMIT 1`,
      [employeeId]
    );
    return r.rows[0] || null;
  }

  async findOpenToday(employeeId, dayStr) {
    const r = await query(
      `SELECT * FROM attendance
       WHERE employee_id = $1
         AND (check_in AT TIME ZONE $3)::date = $2::date
         AND check_out IS NULL
       ORDER BY check_in DESC LIMIT 1`,
      [employeeId, dayStr, config.attendanceCalendarTz]
    );
    return r.rows[0] || null;
  }

  async findAnyToday(employeeId, dayStr) {
    const r = await query(
      `SELECT * FROM attendance
       WHERE employee_id = $1
         AND (check_in AT TIME ZONE $3)::date = $2::date
       ORDER BY check_in DESC LIMIT 1`,
      [employeeId, dayStr, config.attendanceCalendarTz]
    );
    return r.rows[0] || null;
  }

  async countTodaySegments(employeeId, dayStr) {
    const r = await query(
      `SELECT COUNT(*)::int AS c FROM attendance
       WHERE employee_id = $1
         AND (check_in AT TIME ZONE $3)::date = $2::date`,
      [employeeId, dayStr, config.attendanceCalendarTz]
    );
    return r.rows[0].c;
  }

  async listTodaySegments(employeeId, dayStr) {
    const r = await query(
      `SELECT * FROM attendance
       WHERE employee_id = $1
         AND (check_in AT TIME ZONE $3)::date = $2::date
       ORDER BY check_in ASC`,
      [employeeId, dayStr, config.attendanceCalendarTz]
    );
    return r.rows;
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
        overtime_minutes = $10,
        attendance_status = $11,
        checkout_code = $12,
        validation_flags = COALESCE(validation_flags, '{}'::jsonb) || $13::jsonb
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
        row.overtimeMinutes ?? 0,
        row.attendanceStatus,
        row.checkoutCode ?? null,
        JSON.stringify(row.validationFlagsOut || {}),
      ]
    );
    return r.rows[0] || null;
  }

  async findById(id) {
    const r = await query(`SELECT * FROM attendance WHERE id = $1`, [id]);
    return r.rows[0] || null;
  }

  async findByIdWithJoins(id) {
    const r = await query(
      `SELECT a.*, e.full_name, e.employee_id AS employee_code, o.name AS office_name
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       JOIN offices o ON o.id = a.office_id
       WHERE a.id = $1`,
      [id]
    );
    return r.rows[0] || null;
  }

  async updateAdminTimes(id, row) {
    const r = await query(
      `UPDATE attendance SET
        check_in = $2,
        check_out = $3,
        late_minutes = $4,
        work_hours = $5,
        overtime_hours = $6,
        overtime_minutes = $7,
        attendance_status = $8,
        validation_flags = COALESCE(validation_flags, '{}'::jsonb) || $9::jsonb
      WHERE id = $1
      RETURNING *`,
      [
        id,
        row.checkIn,
        row.checkOut,
        row.lateMinutes ?? 0,
        row.workHours,
        row.overtimeHours,
        row.overtimeMinutes ?? 0,
        row.attendanceStatus,
        JSON.stringify(row.validationFlagsPatch || {}),
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
      `SELECT a.*, o.name AS office_name,
        EXISTS (
          SELECT 1 FROM attendance_correction_requests c
          WHERE c.attendance_id = a.id AND c.approval_status = 'pending'
        ) AS pending_correction
       FROM attendance a
       JOIN offices o ON o.id = a.office_id
       WHERE a.employee_id = $1
       ORDER BY a.check_in DESC
       LIMIT $2`,
      [employeeId, limit]
    );
    return r.rows;
  }

  /** Same columns as listAllWithJoins, scoped to one employee (admin / reporting). */
  async listForEmployeeWithJoins(employeeId, limit = 120) {
    const r = await query(
      `SELECT a.*, e.full_name, e.employee_id AS employee_code, o.name AS office_name
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
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

  /**
   * Completed check-outs with delivery data from petugas lapangan at the given office.
   */
  async listFieldOfficerDeliveriesByOffice(officeId, { limit = 100, days = 60 } = {}) {
    const r = await query(
      `SELECT
        a.id,
        a.check_in,
        a.check_out,
        a.checkout_code,
        e.full_name,
        e.employee_id AS employee_code,
        o.name AS office_name
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       JOIN users u ON u.employee_id = e.id AND u.role = 'field_officer'
       JOIN offices o ON o.id = a.office_id
       WHERE a.office_id = $1
         AND a.check_out IS NOT NULL
         AND NULLIF(TRIM(a.checkout_code), '') IS NOT NULL
         AND a.check_out >= (CURRENT_TIMESTAMP - ($3::int || ' days')::interval)
       ORDER BY a.check_out DESC
       LIMIT $2`,
      [officeId, limit, days]
    );
    return r.rows;
  }

  async sumLateMinutesInPeriod(employeeId, periodStart, periodEnd) {
    const tz = config.attendanceCalendarTz || 'Asia/Jakarta';
    const r = await query(
      `SELECT COALESCE(SUM(GREATEST(COALESCE(late_minutes, 0), 0)), 0)::int AS total
       FROM attendance
       WHERE employee_id = $1
         AND (check_in AT TIME ZONE $4)::date >= $2::date
         AND (check_in AT TIME ZONE $4)::date <= $3::date`,
      [employeeId, periodStart, periodEnd, tz]
    );
    return r.rows[0]?.total ?? 0;
  }

  async listOvertimeRowsInPeriod(employeeId, periodStart, periodEnd) {
    const tz = config.attendanceCalendarTz || 'Asia/Jakarta';
    const r = await query(
      `SELECT check_out, overtime_minutes
       FROM attendance
       WHERE employee_id = $1
         AND check_out IS NOT NULL
         AND (check_out AT TIME ZONE $4)::date >= $2::date
         AND (check_out AT TIME ZONE $4)::date <= $3::date`,
      [employeeId, periodStart, periodEnd, tz]
    );
    return r.rows;
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

  /**
   * Monthly-style summary: each active employee with count of distinct calendar days
   * they have at least one attendance row in [dateFrom, dateTo].
   */
  async absenHjsSummary(dateFrom, dateTo) {
    const r = await query(
      `SELECT e.full_name AS full_name,
        COALESCE(cnt.days_n, 0)::int AS hari_kerja
       FROM employees e
       LEFT JOIN (
         SELECT employee_id, COUNT(DISTINCT check_in::date)::int AS days_n
         FROM attendance
         WHERE check_in::date >= $1::date AND check_in::date <= $2::date
         GROUP BY employee_id
       ) cnt ON cnt.employee_id = e.id
       WHERE e.status = 'active'
       ORDER BY e.full_name ASC`,
      [dateFrom, dateTo]
    );
    return r.rows;
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
