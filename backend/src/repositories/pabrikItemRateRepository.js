const { query } = require('../db/pool');

class PabrikItemRateRepository {
  async listAll() {
    const r = await query(
      `SELECT id, pabrik_code, kode_barang, tonase_per_item, created_at, updated_at
       FROM pabrik_item_rates
       ORDER BY pabrik_code ASC, kode_barang ASC`
    );
    return r.rows;
  }

  async findByPabrikAndBarang(pabrikCode, kodeBarang) {
    const r = await query(
      `SELECT id, pabrik_code, kode_barang, tonase_per_item
       FROM pabrik_item_rates
       WHERE pabrik_code = $1 AND kode_barang = $2`,
      [String(pabrikCode).trim(), String(kodeBarang).trim()]
    );
    return r.rows[0] || null;
  }

  async create({ pabrik_code, kode_barang, tonase_per_item }) {
    const r = await query(
      `INSERT INTO pabrik_item_rates (pabrik_code, kode_barang, tonase_per_item)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [pabrik_code, kode_barang, tonase_per_item]
    );
    return r.rows[0];
  }

  async update(id, { pabrik_code, kode_barang, tonase_per_item }) {
    const r = await query(
      `UPDATE pabrik_item_rates
       SET pabrik_code = $2, kode_barang = $3, tonase_per_item = $4, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, pabrik_code, kode_barang, tonase_per_item]
    );
    return r.rows[0] || null;
  }

  async delete(id) {
    const r = await query(`DELETE FROM pabrik_item_rates WHERE id = $1 RETURNING id`, [id]);
    return r.rows[0] || null;
  }
}

module.exports = { PabrikItemRateRepository };
