const { query } = require('../db/pool');

class MetaRepository {
  async defaultDepartmentAndPosition() {
    const d = await query(`SELECT id FROM departments WHERE name = 'General' LIMIT 1`);
    const p = await query(`SELECT id FROM positions WHERE title = 'Staff' LIMIT 1`);
    return { departmentId: d.rows[0].id, positionId: p.rows[0].id };
  }

  async firstOfficeId() {
    const r = await query(`SELECT id FROM offices ORDER BY id LIMIT 1`);
    return r.rows[0]?.id || null;
  }
}

module.exports = { MetaRepository };
