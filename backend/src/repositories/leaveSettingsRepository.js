const { query } = require('../db/pool');

class LeaveSettingsRepository {
  async get() {
    const r = await query(`SELECT * FROM leave_settings WHERE id = 1`);
    return r.rows[0] || null;
  }

  async update({ medicalDaysPerYear, unpaidDaysPerYear, paternityDaysPerYear }) {
    const r = await query(
      `UPDATE leave_settings SET
        medical_days_per_year = $1,
        unpaid_days_per_year = $2,
        paternity_days_per_year = $3,
        updated_at = NOW()
       WHERE id = 1
       RETURNING *`,
      [medicalDaysPerYear, unpaidDaysPerYear, paternityDaysPerYear]
    );
    return r.rows[0];
  }
}

module.exports = { LeaveSettingsRepository };
