const { query } = require('../db/pool');

class EmployeeRepository {
  async create({
    employeeId,
    fullName,
    departmentId,
    positionId,
    salaryType,
    basicSalary,
    joinDate,
    status,
  }) {
    const r = await query(
      `INSERT INTO employees (employee_id, full_name, department_id, position_id, salary_type, basic_salary, join_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
      ]
    );
    return r.rows[0];
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

  async assignShift(employeeId, shiftId, effectiveFrom) {
    await query(
      `INSERT INTO employee_shifts (employee_id, shift_id, effective_from)
       VALUES ($1, $2, $3)
       ON CONFLICT (employee_id, effective_from) DO UPDATE SET shift_id = EXCLUDED.shift_id`,
      [employeeId, shiftId, effectiveFrom]
    );
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

  async seedDefaultLeaveBalances(employeeId) {
    await query(
      `INSERT INTO leave_balances (employee_id, leave_type, balance_days) VALUES
       ($1, 'annual', 12), ($1, 'sick', 10)
       ON CONFLICT (employee_id, leave_type) DO NOTHING`,
      [employeeId]
    );
  }

  async updateEnterpriseFields(id, { photo_url, contract_status, department_id, position_id }) {
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
