const { pool, query } = require('../db/pool');

const PABRIK_SELECT = `
  p.id,
  p.pabrik_code,
  p.nama_pabrik,
  p.office_id,
  o.name AS office_name,
  o.link AS office_link,
  CASE
    WHEN p.office_id IS NOT NULL THEN o.link
    ELSE p.google_maps_url
  END AS google_maps_url,
  p.radius_meters,
  p.bonus_omset_rate,
  p.sort_order,
  p.created_at,
  p.updated_at`;

class PabrikRepository {
  async listWithItems() {
    const r = await query(
      `SELECT
        ${PABRIK_SELECT},
        COALESCE(
          json_agg(
            json_build_object(
              'id', r.id,
              'kode_barang', r.kode_barang,
              'nama_barang', r.nama_barang,
              'tonase_per_item', r.tonase_per_item,
              'price_per_item', r.price_per_item
            )
            ORDER BY r.kode_barang
          ) FILTER (WHERE r.id IS NOT NULL),
          '[]'
        ) AS items
       FROM pabriks p
       LEFT JOIN offices o ON o.id = p.office_id
       LEFT JOIN pabrik_item_rates r ON r.pabrik_code = p.pabrik_code
       GROUP BY p.id, o.id
       ORDER BY p.sort_order ASC, p.pabrik_code ASC`
    );
    return r.rows.map((row) => ({
      ...row,
      items: Array.isArray(row.items) ? row.items : [],
    }));
  }

  async findById(id) {
    const r = await query(
      `SELECT ${PABRIK_SELECT}
       FROM pabriks p
       LEFT JOIN offices o ON o.id = p.office_id
       WHERE p.id = $1`,
      [id]
    );
    return r.rows[0] || null;
  }

  async findByCode(pabrikCode) {
    const r = await query(
      `SELECT p.id, p.pabrik_code, p.nama_pabrik, p.office_id, p.bonus_omset_rate, p.sort_order,
              CASE WHEN p.office_id IS NOT NULL THEN o.link ELSE p.google_maps_url END AS google_maps_url
       FROM pabriks p
       LEFT JOIN offices o ON o.id = p.office_id
       WHERE p.pabrik_code = $1`,
      [String(pabrikCode).trim()]
    );
    return r.rows[0] || null;
  }

  async nextSortOrder() {
    const r = await query(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM pabriks`);
    return Number(r.rows[0]?.n) || 1;
  }

  async create({
    pabrik_code,
    nama_pabrik,
    google_maps_url,
    office_id,
    radius_meters,
    bonus_omset_rate,
    sort_order,
  }) {
    const r = await query(
      `INSERT INTO pabriks (pabrik_code, nama_pabrik, google_maps_url, office_id, radius_meters, bonus_omset_rate, sort_order)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0.02), $7)
       RETURNING id`,
      [
        pabrik_code,
        nama_pabrik,
        google_maps_url,
        office_id ?? null,
        radius_meters ?? null,
        bonus_omset_rate ?? null,
        sort_order,
      ]
    );
    return this.findById(r.rows[0].id);
  }

  async updateById(id, { nama_pabrik, google_maps_url, office_id, radius_meters, bonus_omset_rate }) {
    const sets = [];
    const params = [id];
    let idx = 2;
    if (nama_pabrik !== undefined) {
      sets.push(`nama_pabrik = $${idx}`);
      params.push(nama_pabrik);
      idx += 1;
    }
    if (radius_meters !== undefined) {
      sets.push(`radius_meters = $${idx}`);
      params.push(radius_meters);
      idx += 1;
    }
    if (bonus_omset_rate !== undefined) {
      sets.push(`bonus_omset_rate = $${idx}`);
      params.push(bonus_omset_rate);
      idx += 1;
    }
    if (office_id !== undefined) {
      sets.push(`office_id = $${idx}`);
      params.push(office_id);
      idx += 1;
      if (office_id != null) {
        sets.push('google_maps_url = NULL');
      }
    }
    if (google_maps_url !== undefined) {
      sets.push(`google_maps_url = $${idx}`);
      params.push(google_maps_url);
      idx += 1;
      if (office_id === undefined) {
        sets.push('office_id = NULL');
      }
    }
    if (!sets.length) return this.findById(id);
    await query(
      `UPDATE pabriks SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`,
      params
    );
    return this.findById(id);
  }

  async updateGoogleMaps(id, google_maps_url) {
    return this.updateById(id, { google_maps_url, office_id: null });
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
