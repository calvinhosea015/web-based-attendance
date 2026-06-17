const { pool, query } = require('../db/pool');

class UserRepository {
  async existsUsernameExcept(username, excludeUserId) {
    const r = await query(
      `SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2 LIMIT 1`,
      [username, excludeUserId]
    );
    return r.rows.length > 0;
  }

  async findByUsername(username) {
    const loginId = String(username || '').trim();
    const r = await query(
      `SELECT u.*, e.id AS emp_pk, e.employee_id AS employee_code, e.full_name, e.remote_work_allowed, e.daily_segments,
              e.segment1_start, e.segment1_end, e.segment2_start, e.segment2_end,
              o.name AS assigned_office_name,
              o.lat AS assigned_office_lat,
              o.lng AS assigned_office_lng
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       LEFT JOIN offices o ON o.id = u.office_id
       WHERE LOWER(u.username) = LOWER($1)
          OR (e.employee_id IS NOT NULL AND LOWER(e.employee_id) = LOWER($1))
       ORDER BY CASE WHEN LOWER(u.username) = LOWER($1) THEN 0 ELSE 1 END
       LIMIT 1`,
      [loginId]
    );
    return r.rows[0] || null;
  }

  async findByEmployeeId(employeeId) {
    const r = await query(
      `SELECT u.id, u.username, u.role, u.employee_id
       FROM users u
       WHERE u.employee_id = $1
       LIMIT 1`,
      [employeeId]
    );
    return r.rows[0] || null;
  }

  async findById(id) {
    const r = await query(
      `SELECT u.*, e.id AS emp_pk, e.employee_id AS employee_code, e.full_name, e.remote_work_allowed, e.daily_segments,
              e.segment1_start, e.segment1_end, e.segment2_start, e.segment2_end,
              o.name AS assigned_office_name,
              o.lat AS assigned_office_lat,
              o.lng AS assigned_office_lng
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
              e.join_date, e.birthday,
              e.remote_work_allowed, e.daily_segments,
              e.segment1_start, e.segment1_end, e.segment2_start, e.segment2_end,
              e.custom_work_start, e.custom_work_end, e.basic_salary
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

  /**
   * @param {number} id
   * @param {number|null} [employeeId] — when set, employee row is removed after user (cascades attendance, payroll, etc.)
   */
  async delete(id, employeeId = null) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId < 1) {
      throw new Error('Invalid user id');
    }
    const empPk =
      employeeId != null && Number.isFinite(Number(employeeId)) && Number(employeeId) > 0
        ? Number(employeeId)
        : null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE activity_logs SET user_id = NULL WHERE user_id = $1`, [numericId]);
      await client.query(`UPDATE audit_logs SET actor_user_id = NULL WHERE actor_user_id = $1`, [numericId]);
      await client.query(`UPDATE overtime_requests SET decided_by = NULL WHERE decided_by = $1`, [numericId]);
      await client.query(`UPDATE loan_requests SET decided_by = NULL WHERE decided_by = $1`, [numericId]);
      await client.query(
        `UPDATE attendance_correction_requests SET decided_by = NULL WHERE decided_by = $1`,
        [numericId]
      );
      await client.query(`UPDATE leave_requests SET approved_by = NULL WHERE approved_by = $1`, [numericId]);
      await client.query(`DELETE FROM users WHERE id = $1`, [numericId]);
      if (empPk) {
        await client.query(`DELETE FROM payroll WHERE employee_id = $1`, [empPk]);
        await client.query(`DELETE FROM employees WHERE id = $1`, [empPk]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
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
