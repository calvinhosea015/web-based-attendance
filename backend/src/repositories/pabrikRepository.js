const { pool, query } = require('../db/pool');

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

  async nextSortOrder() {
    const r = await query(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM pabriks`);
    return Number(r.rows[0]?.n) || 1;
  }

  async create({ pabrik_code, nama_pabrik, google_maps_url, sort_order }) {
    const r = await query(
      `INSERT INTO pabriks (pabrik_code, nama_pabrik, google_maps_url, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id, pabrik_code, nama_pabrik, google_maps_url, sort_order, created_at, updated_at`,
      [pabrik_code, nama_pabrik, google_maps_url, sort_order]
    );
    return r.rows[0];
  }

  async updateById(id, { nama_pabrik, google_maps_url }) {
    const sets = [];
    const params = [id];
    let idx = 2;
    if (nama_pabrik !== undefined) {
      sets.push(`nama_pabrik = $${idx}`);
      params.push(nama_pabrik);
      idx += 1;
    }
    if (google_maps_url !== undefined) {
      sets.push(`google_maps_url = $${idx}`);
      params.push(google_maps_url);
      idx += 1;
    }
    if (!sets.length) return this.findById(id);
    const r = await query(
      `UPDATE pabriks
       SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $1
       RETURNING id, pabrik_code, nama_pabrik, google_maps_url, sort_order, updated_at`,
      params
    );
    return r.rows[0] || null;
  }

  async updateGoogleMaps(id, google_maps_url) {
    return this.updateById(id, { google_maps_url });
  }

  async deleteById(id) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT id, pabrik_code FROM pabriks WHERE id = $1`,
        [id]
      );
      if (!found.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      const { pabrik_code } = found.rows[0];
      await client.query(`DELETE FROM pabrik_item_rates WHERE pabrik_code = $1`, [pabrik_code]);
      const del = await client.query(`DELETE FROM pabriks WHERE id = $1 RETURNING id`, [id]);
      await client.query('COMMIT');
      return del.rows[0] || null;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = { PabrikRepository };
