const { query } = require('../db/pool');

class UserRepository {
  async findByUsername(username) {
    const r = await query(
      `SELECT u.*, e.id AS emp_pk, e.employee_id AS employee_code, e.full_name
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       WHERE u.username = $1`,
      [username]
    );
    return r.rows[0] || null;
  }

  async findById(id) {
    const r = await query(
      `SELECT u.*, e.id AS emp_pk, e.employee_id AS employee_code, e.full_name
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       WHERE u.id = $1`,
      [id]
    );
    return r.rows[0] || null;
  }

  async listSummary() {
    const r = await query(
      `SELECT u.id, u.username, u.role, u.office_id, u.employee_id, e.employee_id AS employee_code, e.full_name
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       ORDER BY u.id`
    );
    return r.rows;
  }

  async create({ username, passwordHash, role, officeId, employeeId }) {
    const r = await query(
      `INSERT INTO users (username, password_hash, role, office_id, employee_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, role, office_id, employee_id`,
      [username, passwordHash, role, officeId || null, employeeId || null]
    );
    return r.rows[0];
  }

  async delete(id) {
    await query(`DELETE FROM users WHERE id = $1`, [id]);
  }

  async updatePassword(id, passwordHash) {
    await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, id]);
  }
}

module.exports = { UserRepository };
