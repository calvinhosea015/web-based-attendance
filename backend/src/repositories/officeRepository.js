const { query } = require('../db/pool');

class OfficeRepository {
  async listAll() {
    const r = await query(`SELECT * FROM offices ORDER BY id`);
    return r.rows;
  }

  async findById(id) {
    const r = await query(`SELECT * FROM offices WHERE id = $1`, [id]);
    return r.rows[0] || null;
  }

  async create({ name, lat, lng, link }) {
    const r = await query(
      `INSERT INTO offices (name, lat, lng, link) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, lat, lng, link || null]
    );
    return r.rows[0];
  }

  async delete(id) {
    await query(`DELETE FROM offices WHERE id = $1`, [id]);
  }
}

module.exports = { OfficeRepository };
