const { query } = require('../db/pool');

function normalizeScope({
  date_from: dateFrom,
  date_to: dateTo,
  pabrik = '',
  officer = '',
  kode_barang: kodeBarang = '',
}) {
  return {
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    pabrik: String(pabrik || '').trim(),
    officer: String(officer || '').trim(),
    kodeBarang: String(kodeBarang || '').trim(),
  };
}

class DeliveryRecapReviewRepository {
  async findLatestForScope(scope) {
    const { dateFrom, dateTo, pabrik, officer, kodeBarang } = normalizeScope(scope);
    const r = await query(
      `SELECT r.*, u.username AS reviewer_username, e.full_name AS reviewer_full_name
       FROM delivery_recap_reviews r
       JOIN users u ON u.id = r.reviewed_by
       LEFT JOIN employees e ON e.id = u.employee_id
       WHERE r.filter_date_from IS NOT DISTINCT FROM $1::date
         AND r.filter_date_to IS NOT DISTINCT FROM $2::date
         AND r.filter_pabrik = $3
         AND r.filter_officer = $4
         AND r.filter_kode_barang = $5
       ORDER BY r.reviewed_at DESC
       LIMIT 1`,
      [dateFrom, dateTo, pabrik, officer, kodeBarang]
    );
    return r.rows[0] || null;
  }

  async create({ scope, checklist, reviewedBy }) {
    const { dateFrom, dateTo, pabrik, officer, kodeBarang } = normalizeScope(scope);
    const r = await query(
      `INSERT INTO delivery_recap_reviews (
         filter_date_from, filter_date_to, filter_pabrik, filter_officer, filter_kode_barang,
         checklist, reviewed_by
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING *`,
      [dateFrom, dateTo, pabrik, officer, kodeBarang, JSON.stringify(checklist || []), reviewedBy]
    );
    return r.rows[0];
  }

  async listRecent(limit = 50) {
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const r = await query(
      `SELECT r.*, u.username AS reviewer_username, e.full_name AS reviewer_full_name
       FROM delivery_recap_reviews r
       JOIN users u ON u.id = r.reviewed_by
       LEFT JOIN employees e ON e.id = u.employee_id
       ORDER BY r.reviewed_at DESC
       LIMIT $1`,
      [safeLimit]
    );
    return r.rows;
  }
}

module.exports = { DeliveryRecapReviewRepository, normalizeScope };
