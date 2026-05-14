const { query } = require('../db/pool');

class EmployeeRepository {
  async create(
    {
      employeeId,
      fullName,
      departmentId,
      positionId,
      salaryType,
      basicSalary,
      joinDate,
      status,
      remoteWorkAllowed,
    },
    exec = query
  ) {
    const r = await exec(
      `INSERT INTO employees (employee_id, full_name, department_id, position_id, salary_type, basic_salary, join_date, status, remote_work_allowed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, true))
       RETURNING *`,
      [
        employeeId,
        fullName,
        departmentId,
        positionId,
        salaryType || 'monthly',
        basicSalary ?? 0,
        joinDate || new Date().toISOString().slice(0, 10),
        status || 'active',
        remoteWorkAllowed !== undefined ? Boolean(remoteWorkAllowed) : null,
      ]
    );
    return r.rows[0];
  }

  async updateFullName(employeePk, fullName, exec = query) {
    const r = await exec(`UPDATE employees SET full_name = $1 WHERE id = $2 RETURNING id`, [
      fullName,
      employeePk,
    ]);
    return r.rowCount > 0;
  }

  /** Next business employee id: EMP + 6-digit zero-padded sequence (EMP000001, …). */
  async nextEmployeeCode() {
    const r = await query(
      `SELECT 'EMP' || LPAD(nextval('employee_code_seq')::text, 6, '0') AS code`
    );
    return r.rows[0].code;
  }

  async countActive() {
    const r = await query(`SELECT COUNT(*)::int AS c FROM employees WHERE status = 'active'`);
    return r.rows[0].c;
  }

  async findById(id) {
    const r = await query(
      `SELECT e.*, d.name AS department_name, p.title AS position_title
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN positions p ON p.id = e.position_id
       WHERE e.id = $1`,
      [id]
    );
    return r.rows[0] || null;
  }

  async getCurrentShift(employeeId) {
    const r = await query(
      `SELECT s.* FROM shifts s
       JOIN employee_shifts es ON es.shift_id = s.id
       WHERE es.employee_id = $1
       ORDER BY es.effective_from DESC
       LIMIT 1`,
      [employeeId]
    );
    return r.rows[0] || null;
  }

  async updateEnterpriseFields(id, { photo_url, contract_status, department_id, position_id, remote_work_allowed }) {
    const sets = [];
    const vals = [];
    let i = 1;
    if (photo_url !== undefined) {
      sets.push(`photo_url = $${i++}`);
      vals.push(photo_url);
    }
    if (contract_status !== undefined) {
      sets.push(`contract_status = $${i++}`);
      vals.push(contract_status);
    }
    if (department_id !== undefined) {
      sets.push(`department_id = $${i++}`);
      vals.push(department_id);
    }
    if (position_id !== undefined) {
      sets.push(`position_id = $${i++}`);
      vals.push(position_id);
    }
    if (remote_work_allowed !== undefined) {
      sets.push(`remote_work_allowed = $${i++}`);
      vals.push(Boolean(remote_work_allowed));
    }
    if (!sets.length) return this.findById(id);
    vals.push(id);
    const r = await query(
      `UPDATE employees SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    return r.rows[0] || null;
  }
}

module.exports = { EmployeeRepository };
