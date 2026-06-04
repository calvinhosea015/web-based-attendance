const { query } = require('../db/pool');

class FieldDeliveryRepository {
  async countForEmployeeOnDate(employeeId, validOn) {
    const r = await query(
      `SELECT COUNT(*)::int AS cnt FROM field_delivery_entries
       WHERE employee_id = $1 AND valid_on = $2`,
      [employeeId, validOn]
    );
    return r.rows[0]?.cnt ?? 0;
  }

  async listForEmployeeOnDate(employeeId, validOn) {
    const r = await query(
      `SELECT * FROM field_delivery_entries
       WHERE employee_id = $1 AND valid_on = $2
       ORDER BY created_at ASC`,
      [employeeId, validOn]
    );
    return r.rows;
  }

  async listForEmployeeBetween(employeeId, periodStart, periodEnd) {
    const r = await query(
      `SELECT * FROM field_delivery_entries
       WHERE employee_id = $1 AND valid_on >= $2::date AND valid_on <= $3::date
       ORDER BY valid_on ASC, created_at ASC`,
      [employeeId, periodStart, periodEnd]
    );
    return r.rows;
  }

  async sumBonusBetween(employeeId, periodStart, periodEnd) {
    const r = await query(
      `SELECT COALESCE(SUM(bonus_amount), 0)::numeric AS total
       FROM field_delivery_entries
       WHERE employee_id = $1 AND valid_on >= $2::date AND valid_on <= $3::date`,
      [employeeId, periodStart, periodEnd]
    );
    return Number(r.rows[0]?.total ?? 0);
  }

  async sumOmsetBetween(employeeId, periodStart, periodEnd) {
    const r = await query(
      `SELECT COALESCE(SUM(omset_amount), 0)::numeric AS total
       FROM field_delivery_entries
       WHERE employee_id = $1 AND valid_on >= $2::date AND valid_on <= $3::date`,
      [employeeId, periodStart, periodEnd]
    );
    return Number(r.rows[0]?.total ?? 0);
  }

  async sumOmsetForEmployeeOnDate(employeeId, validOn) {
    const r = await query(
      `SELECT COALESCE(SUM(omset_amount), 0)::numeric AS total
       FROM field_delivery_entries
       WHERE employee_id = $1 AND valid_on = $2`,
      [employeeId, validOn]
    );
    return Number(r.rows[0]?.total ?? 0);
  }

  async listDeliveriesInPeriod(periodStart, periodEnd) {
    const r = await query(
      `SELECT
        fde.*,
        e.full_name,
        e.employee_id AS employee_code
       FROM field_delivery_entries fde
       JOIN employees e ON e.id = fde.employee_id
       JOIN users u ON u.employee_id = e.id AND u.role = 'field_officer'
       WHERE fde.valid_on >= $1::date AND fde.valid_on <= $2::date
       ORDER BY e.full_name ASC, fde.valid_on ASC, fde.created_at ASC`,
      [periodStart, periodEnd]
    );
    return r.rows;
  }

  async createEntry(row) {
    const r = await query(
      `INSERT INTO field_delivery_entries (
        employee_id, valid_on, checkout_code,
        pabrik_code, norek, nomor_tanda_terima, nomor_surat_jalan, nopol, no_bs,
        kode_barang, kotor, berat_bersih, selisih, tonase_per_item, omset_amount, bonus_amount,
        attendance_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *`,
      [
        row.employee_id,
        row.valid_on,
        row.checkout_code,
        row.pabrik_code,
        row.norek,
        row.nomor_tanda_terima,
        row.nomor_surat_jalan,
        row.nopol,
        row.no_bs,
        row.kode_barang,
        row.kotor,
        row.berat_bersih,
        row.selisih,
        row.tonase_per_item,
        row.omset_amount,
        row.bonus_amount,
        row.attendance_id ?? null,
      ]
    );
    return r.rows[0];
  }

  async linkAttendanceForDate(employeeId, validOn, attendanceId) {
    await query(
      `UPDATE field_delivery_entries SET attendance_id = $3
       WHERE employee_id = $1 AND valid_on = $2 AND attendance_id IS NULL`,
      [employeeId, validOn, attendanceId]
    );
  }

  async sumBonusForEmployeeOnDate(employeeId, validOn) {
    const r = await query(
      `SELECT COALESCE(SUM(bonus_amount), 0)::numeric AS total
       FROM field_delivery_entries
       WHERE employee_id = $1 AND valid_on = $2`,
      [employeeId, validOn]
    );
    return Number(r.rows[0]?.total ?? 0);
  }
}

module.exports = { FieldDeliveryRepository };
