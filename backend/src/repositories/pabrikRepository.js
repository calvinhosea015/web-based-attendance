const { query } = require('../db/pool');

class PabrikRepository {
  async listWithItems() {
    const r = await query(
      `SELECT
        p.id,
        p.pabrik_code,
        p.nama_pabrik,
        p.google_maps_url,
        p.sort_order,
        p.created_at,
        p.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', r.id,
              'kode_barang', r.kode_barang,
              'tonase_per_item', r.tonase_per_item
            )
            ORDER BY r.kode_barang
          ) FILTER (WHERE r.id IS NOT NULL),
          '[]'
        ) AS items
       FROM pabriks p
       LEFT JOIN pabrik_item_rates r ON r.pabrik_code = p.pabrik_code
       GROUP BY p.id
       ORDER BY p.sort_order ASC, p.pabrik_code ASC`
    );
    return r.rows.map((row) => ({
      ...row,
      items: Array.isArray(row.items) ? row.items : [],
    }));
  }

  async findById(id) {
    const r = await query(
      `SELECT id, pabrik_code, nama_pabrik, google_maps_url, sort_order, created_at, updated_at
       FROM pabriks WHERE id = $1`,
      [id]
    );
    return r.rows[0] || null;
  }

  async findByCode(pabrikCode) {
    const r = await query(
      `SELECT id, pabrik_code, nama_pabrik, google_maps_url, sort_order
       FROM pabriks WHERE pabrik_code = $1`,
      [String(pabrikCode).trim()]
    );
    return r.rows[0] || null;
  }

  async updateGoogleMaps(id, google_maps_url) {
    const r = await query(
      `UPDATE pabriks
       SET google_maps_url = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, pabrik_code, nama_pabrik, google_maps_url, sort_order, updated_at`,
      [id, google_maps_url]
    );
    return r.rows[0] || null;
  }
}

module.exports = { PabrikRepository };
