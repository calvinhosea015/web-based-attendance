const { query } = require('../db/pool');

class FieldCodeEntryRepository {
  async findForEmployeeOnDate(employeeId, validOn) {
    const r = await query(
      `SELECT * FROM field_code_entries
       WHERE employee_id = $1 AND valid_on = $2`,
      [employeeId, validOn]
    );
    return r.rows[0] || null;
  }

  async createForEmployeeOnDate(employeeId, validOn) {
    const r = await query(
      `INSERT INTO field_code_entries (employee_id, valid_on)
       VALUES ($1, $2)
       RETURNING *`,
      [employeeId, validOn]
    );
    return r.rows[0];
  }

  async linkAttendance(employeeId, validOn, attendanceId) {
    const r = await query(
      `UPDATE field_code_entries SET attendance_id = $3
       WHERE employee_id = $1 AND valid_on = $2
       RETURNING *`,
      [employeeId, validOn, attendanceId]
    );
    return r.rows[0] || null;
  }
}

module.exports = { FieldCodeEntryRepository };
