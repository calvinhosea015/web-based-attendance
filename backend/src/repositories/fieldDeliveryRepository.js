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
        e.employee_id AS employee_code,
        p.nama_pabrik
       FROM field_delivery_entries fde
       JOIN employees e ON e.id = fde.employee_id
       JOIN users u ON u.employee_id = e.id AND u.role = 'field_officer'
       LEFT JOIN pabriks p ON p.pabrik_code = fde.pabrik_code
       WHERE fde.valid_on >= $1::date AND fde.valid_on <= $2::date
       ORDER BY e.full_name ASC, fde.valid_on ASC, fde.created_at ASC`,
      [periodStart, periodEnd]
    );
    return r.rows;
  }

  async summarizeByFactoryItem(periodStart, periodEnd) {
    const r = await query(
      `SELECT
        fde.pabrik_code,
        COALESCE(p.nama_pabrik, '') AS nama_pabrik,
        fde.kode_barang,
        MAX(fde.tonase_per_item)::numeric AS tonase_per_item,
        MAX(fde.price_per_item)::numeric AS price_per_item,
        COUNT(*)::int AS delivery_count,
        COALESCE(SUM(fde.selisih), 0)::numeric AS total_selisih,
        COALESCE(SUM(fde.omset_amount), 0)::numeric AS total_omset,
        COALESCE(SUM(fde.bonus_amount), 0)::numeric AS total_bonus
       FROM field_delivery_entries fde
       JOIN users u ON u.employee_id = fde.employee_id AND u.role = 'field_officer'
       LEFT JOIN pabriks p ON p.pabrik_code = fde.pabrik_code
       WHERE fde.valid_on >= $1::date AND fde.valid_on <= $2::date
       GROUP BY fde.pabrik_code, p.nama_pabrik, fde.kode_barang
       ORDER BY fde.pabrik_code ASC, fde.kode_barang ASC`,
      [periodStart, periodEnd]
    );
    return r.rows;
  }

  async createEntry(row) {
    const r = await query(
      `INSERT INTO field_delivery_entries (
        employee_id, valid_on, checkout_code,
        pabrik_code, norek, nomor_tanda_terima, nomor_surat_jalan, nopol, no_bs,
        kode_barang, kotor, berat_bersih, selisih, tonase_per_item, price_per_item, omset_amount,
        bonus_amount, attendance_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
        row.price_per_item ?? 0,
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

  /**
   * All delivery lines from petugas lapangan (admin recap).
   */
  async listAll({ limit = 5000 } = {}) {
    const r = await query(
      `SELECT
        fde.id,
        fde.valid_on,
        fde.created_at,
        fde.checkout_code,
        fde.pabrik_code,
        fde.norek,
        fde.nomor_tanda_terima,
        fde.nomor_surat_jalan,
        fde.nopol,
        fde.no_bs,
        fde.kode_barang,
        fde.kotor,
        fde.berat_bersih,
        fde.selisih,
        fde.tonase_per_item,
        fde.price_per_item,
        fde.omset_amount,
        fde.bonus_amount,
        e.full_name,
        e.employee_id AS employee_code,
        COALESCE(p.nama_pabrik, '') AS nama_pabrik,
        o.name AS office_name,
        a.check_out
       FROM field_delivery_entries fde
       JOIN employees e ON e.id = fde.employee_id
       JOIN users u ON u.employee_id = e.id AND u.role = 'field_officer'
       LEFT JOIN pabriks p ON p.pabrik_code = fde.pabrik_code
       LEFT JOIN offices o ON o.id = COALESCE(p.office_id, u.office_id)
       LEFT JOIN attendance a ON a.id = fde.attendance_id
       ORDER BY fde.valid_on DESC, fde.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return r.rows;
  }

  /**
   * Delivery lines from petugas lapangan visible to staff at the given office.
   */
  async listByOffice(officeId, { limit = 100, days = 60 } = {}) {
    const r = await query(
      `SELECT
        fde.id,
        fde.valid_on,
        fde.created_at,
        fde.checkout_code,
        fde.pabrik_code,
        fde.norek,
        fde.nomor_tanda_terima,
        fde.nomor_surat_jalan,
        fde.nopol,
        fde.no_bs,
        fde.kode_barang,
        fde.kotor,
        fde.berat_bersih,
        fde.selisih,
        fde.tonase_per_item,
        fde.price_per_item,
        fde.omset_amount,
        fde.bonus_amount,
        e.full_name,
        e.employee_id AS employee_code,
        COALESCE(p.nama_pabrik, '') AS nama_pabrik,
        o.name AS office_name,
        a.check_out
       FROM field_delivery_entries fde
       JOIN employees e ON e.id = fde.employee_id
       JOIN users u ON u.employee_id = e.id AND u.role = 'field_officer'
       LEFT JOIN pabriks p ON p.pabrik_code = fde.pabrik_code
       LEFT JOIN offices o ON o.id = COALESCE(p.office_id, u.office_id)
       LEFT JOIN attendance a ON a.id = fde.attendance_id
       WHERE fde.valid_on >= (CURRENT_DATE - $3::int)
         AND (
           u.office_id = $1
           OR EXISTS (
             SELECT 1 FROM employee_pabriks ep
             JOIN pabriks pb ON pb.id = ep.pabrik_id
             WHERE ep.employee_id = fde.employee_id AND pb.office_id = $1
           )
         )
       ORDER BY fde.valid_on DESC, fde.created_at DESC
       LIMIT $2`,
      [officeId, limit, days]
    );
    return r.rows;
  }
}

module.exports = { FieldDeliveryRepository };
