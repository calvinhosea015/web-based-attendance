const { query } = require('../db/pool');

class DepartmentRepository {
  async list() {
    const r = await query(`SELECT * FROM departments ORDER BY name`);
    return r.rows;
  }

  async create(name) {
    const r = await query(
      `INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *`,
      [name]
    );
    if (r.rows[0]) return r.rows[0];
    const ex = await query(`SELECT * FROM departments WHERE name = $1`, [name]);
    return ex.rows[0];
  }
}

module.exports = { DepartmentRepository };
