const { query } = require('../db/pool');

class UserRepository {
  async existsUsernameExcept(username, excludeUserId) {
    const r = await query(`SELECT 1 FROM users WHERE username = $1 AND id <> $2 LIMIT 1`, [
      username,
      excludeUserId,
    ]);
    return r.rows.length > 0;
  }

  async findByUsername(username) {
    const r = await query(
      `SELECT u.*, e.id AS emp_pk, e.employee_id AS employee_code, e.full_name, e.remote_work_allowed,
              o.name AS assigned_office_name
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       LEFT JOIN offices o ON o.id = u.office_id
       WHERE u.username = $1`,
      [username]
    );
    return r.rows[0] || null;
  }

  async findById(id) {
    const r = await query(
      `SELECT u.*, e.id AS emp_pk, e.employee_id AS employee_code, e.full_name, e.remote_work_allowed,
              o.name AS assigned_office_name
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       LEFT JOIN offices o ON o.id = u.office_id
       WHERE u.id = $1`,
      [id]
    );
    return r.rows[0] || null;
  }

  async listSummary() {
    const r = await query(
      `SELECT u.id, u.username, u.role, u.office_id, u.employee_id, e.employee_id AS employee_code, e.full_name,
              e.remote_work_allowed
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

  /**
   * @param {Record<string, unknown>} patch — optional keys: username, role, officeId, employeeId (null clears link)
   * @param {(text: string, params?: unknown[]) => Promise<import('pg').QueryResult>} [exec]
   */
  async updatePatch(id, patch, exec = query) {
    const sets = [];
    const vals = [];
    let i = 1;
    if (patch.username !== undefined) {
      sets.push(`username = $${i++}`);
      vals.push(patch.username);
    }
    if (patch.role !== undefined) {
      sets.push(`role = $${i++}`);
      vals.push(patch.role);
    }
    if (patch.officeId !== undefined) {
      sets.push(`office_id = $${i++}`);
      vals.push(patch.officeId);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'employeeId')) {
      sets.push(`employee_id = $${i++}`);
      vals.push(patch.employeeId);
    }
    if (!sets.length) return;
    vals.push(id);
    await exec(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, vals);
  }
}

module.exports = { UserRepository };
