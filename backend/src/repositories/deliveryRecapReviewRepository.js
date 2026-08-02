const { query } = require('../db/pool');

function formatRecapReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    delivery_entry_id: row.delivery_entry_id ?? null,
    is_correct: row.is_correct ?? null,
    notes: row.notes ?? null,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at ?? null,
    reviewer_username: row.reviewer_username ?? null,
    reviewer_full_name: row.reviewer_full_name ?? null,
  };
}

class DeliveryRecapReviewRepository {
  async findLatestForDelivery(deliveryEntryId) {
    const r = await query(
      `SELECT r.*, u.username AS reviewer_username, e.full_name AS reviewer_full_name
       FROM delivery_recap_reviews r
       JOIN users u ON u.id = r.reviewed_by
       LEFT JOIN employees e ON e.id = u.employee_id
       WHERE r.delivery_entry_id = $1 AND r.is_correct IS NOT NULL
       ORDER BY r.reviewed_at DESC
       LIMIT 1`,
      [deliveryEntryId]
    );
    return r.rows[0] || null;
  }

  async mapLatestByDeliveryIds(deliveryIds) {
    const ids = [...new Set(deliveryIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
    if (!ids.length) return new Map();
    const r = await query(
      `SELECT DISTINCT ON (r.delivery_entry_id)
              r.*, u.username AS reviewer_username, e.full_name AS reviewer_full_name
       FROM delivery_recap_reviews r
       JOIN users u ON u.id = r.reviewed_by
       LEFT JOIN employees e ON e.id = u.employee_id
       WHERE r.delivery_entry_id = ANY($1::int[]) AND r.is_correct IS NOT NULL
       ORDER BY r.delivery_entry_id, r.reviewed_at DESC`,
      [ids]
    );
    const map = new Map();
    for (const row of r.rows) {
      map.set(Number(row.delivery_entry_id), row);
    }
    return map;
  }

  async create({ deliveryEntryId, isCorrect, notes, reviewedBy }) {
    const r = await query(
      `INSERT INTO delivery_recap_reviews (delivery_entry_id, is_correct, notes, reviewed_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [deliveryEntryId, Boolean(isCorrect), notes || null, reviewedBy]
    );
    return r.rows[0];
  }

  async listRecent(limit = 50) {
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const r = await query(
      `SELECT r.*, u.username AS reviewer_username, rev.full_name AS reviewer_full_name,
              fde.valid_on, fde.pabrik_code, fde.kode_barang, fde.nomor_surat_jalan,
              del.full_name AS delivery_officer_name, del.employee_id AS delivery_employee_code
       FROM delivery_recap_reviews r
       JOIN users u ON u.id = r.reviewed_by
       LEFT JOIN employees rev ON rev.id = u.employee_id
       JOIN field_delivery_entries fde ON fde.id = r.delivery_entry_id
       JOIN employees del ON del.id = fde.employee_id
       WHERE r.is_correct IS NOT NULL AND r.delivery_entry_id IS NOT NULL
       ORDER BY r.reviewed_at DESC
       LIMIT $1`,
      [safeLimit]
    );
    return r.rows;
  }

  /** Deliveries whose latest Staff Kantor check is incorrect (admin field-ops badge). */
  async countIncorrectLatest() {
    const r = await query(
      `SELECT COUNT(*)::int AS cnt
       FROM (
         SELECT DISTINCT ON (r.delivery_entry_id) r.is_correct
         FROM delivery_recap_reviews r
         WHERE r.delivery_entry_id IS NOT NULL AND r.is_correct IS NOT NULL
         ORDER BY r.delivery_entry_id, r.reviewed_at DESC
       ) latest
       WHERE latest.is_correct = false`
    );
    return Number(r.rows[0]?.cnt ?? 0);
  }

  /** Deliveries with no Staff Kantor check yet (staff kantor badge). */
  async countUnchecked() {
    const r = await query(
      `SELECT COUNT(*)::int AS cnt
       FROM field_delivery_entries fde
       JOIN employees e ON e.id = fde.employee_id
       JOIN users u ON u.employee_id = e.id AND u.role = 'field_officer'
       WHERE NOT EXISTS (
         SELECT 1 FROM delivery_recap_reviews r
         WHERE r.delivery_entry_id = fde.id AND r.is_correct IS NOT NULL
       )`
    );
    return Number(r.rows[0]?.cnt ?? 0);
  }
}

module.exports = { DeliveryRecapReviewRepository, formatRecapReview };
