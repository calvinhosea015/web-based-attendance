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
      `SELECT
        fde.*,
        COALESCE(p.nama_pabrik, '') AS nama_pabrik,
        COALESCE(r.nama_barang, '') AS nama_barang
       FROM field_delivery_entries fde
       LEFT JOIN pabriks p ON p.pabrik_code = fde.pabrik_code
       LEFT JOIN pabrik_item_rates r
         ON r.pabrik_code = fde.pabrik_code AND r.kode_barang = fde.kode_barang
       WHERE fde.employee_id = $1 AND fde.valid_on >= $2::date AND fde.valid_on <= $3::date
       ORDER BY fde.valid_on ASC, fde.created_at ASC`,
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

  async listDeliveriesInPeriod(periodStart, periodEnd, { pabrikCode } = {}) {
    const params = [periodStart, periodEnd];
    let pabrikClause = '';
    const code = String(pabrikCode || '').trim();
    if (code) {
      params.push(code);
      pabrikClause = ` AND fde.pabrik_code = $${params.length}`;
    }
    const r = await query(
      `SELECT
        fde.*,
        e.full_name,
        e.employee_id AS employee_code,
        p.nama_pabrik,
        r.nama_barang
       FROM field_delivery_entries fde
       JOIN employees e ON e.id = fde.employee_id
       JOIN users u ON u.employee_id = e.id AND u.role = 'field_officer'
       LEFT JOIN pabriks p ON p.pabrik_code = fde.pabrik_code
       LEFT JOIN pabrik_item_rates r
         ON r.pabrik_code = fde.pabrik_code AND r.kode_barang = fde.kode_barang
       WHERE fde.valid_on >= $1::date AND fde.valid_on <= $2::date
       ${pabrikClause}
       ORDER BY e.full_name ASC, fde.valid_on ASC, fde.created_at ASC`,
      params
    );
    return r.rows;
  }

  async summarizeByFactoryItem(periodStart, periodEnd, { pabrikCode } = {}) {
    const params = [periodStart, periodEnd];
    let pabrikClause = '';
    const code = String(pabrikCode || '').trim();
    if (code) {
      params.push(code);
      pabrikClause = ` AND fde.pabrik_code = $${params.length}`;
    }
    const r = await query(
      `SELECT
        fde.pabrik_code,
        COALESCE(p.nama_pabrik, '') AS nama_pabrik,
        fde.kode_barang,
        MAX(r.nama_barang) AS nama_barang,
        MAX(fde.price_per_item)::numeric AS price_per_item,
        COUNT(*)::int AS delivery_count,
        COALESCE(SUM(fde.berat_bersih), 0)::numeric AS total_berat_bersih,
        COALESCE(SUM(fde.omset_amount), 0)::numeric AS total_omset,
        COALESCE(SUM(fde.bonus_amount), 0)::numeric AS total_bonus
       FROM field_delivery_entries fde
       JOIN users u ON u.employee_id = fde.employee_id AND u.role = 'field_officer'
       LEFT JOIN pabriks p ON p.pabrik_code = fde.pabrik_code
       LEFT JOIN pabrik_item_rates r
         ON r.pabrik_code = fde.pabrik_code AND r.kode_barang = fde.kode_barang
       WHERE fde.valid_on >= $1::date AND fde.valid_on <= $2::date
       ${pabrikClause}
       GROUP BY fde.pabrik_code, p.nama_pabrik, fde.kode_barang
       ORDER BY fde.pabrik_code ASC, fde.kode_barang ASC`,
      params
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

  async findById(id) {
    const r = await query(`SELECT * FROM field_delivery_entries WHERE id = $1`, [id]);
    return r.rows[0] ?? null;
  }

  async updateEntry(id, fields) {
    const r = await query(
      `UPDATE field_delivery_entries SET
        pabrik_code = $2,
        norek = $3,
        nomor_tanda_terima = $4,
        nomor_surat_jalan = $5,
        nopol = $6,
        no_bs = $7,
        kode_barang = $8,
        kotor = $9,
        berat_bersih = $10,
        selisih = $11,
        tonase_per_item = $12,
        price_per_item = $13,
        omset_amount = $14,
        bonus_amount = $15
       WHERE id = $1
       RETURNING *`,
      [
        id,
        fields.pabrik_code,
        fields.norek,
        fields.nomor_tanda_terima,
        fields.nomor_surat_jalan,
        fields.nopol,
        fields.no_bs,
        fields.kode_barang,
        fields.kotor,
        fields.berat_bersih,
        fields.selisih,
        fields.tonase_per_item,
        fields.price_per_item,
        fields.omset_amount,
        fields.bonus_amount,
      ]
    );
    return r.rows[0] ?? null;
  }

  async updateValidOn(id, validOn, attendanceId) {
    const r = await query(
      `UPDATE field_delivery_entries SET
        valid_on = $2::date,
        attendance_id = $3
       WHERE id = $1
       RETURNING *`,
      [id, validOn, attendanceId]
    );
    return r.rows[0] ?? null;
  }

  async deleteEntry(id) {
    const r = await query(`DELETE FROM field_delivery_entries WHERE id = $1 RETURNING id`, [id]);
    return r.rows[0] ?? null;
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
