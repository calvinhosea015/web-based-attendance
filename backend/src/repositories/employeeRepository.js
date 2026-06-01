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
      upahHarian,
      joinDate,
      birthday,
      status,
      remoteWorkAllowed,
      dailySegments,
      segment1_start,
      segment1_end,
      segment2_start,
      segment2_end,
      custom_work_start,
      custom_work_end,
    },
    exec = query
  ) {
    const ds = dailySegments === 2 ? 2 : 1;
    const r = await exec(
      `INSERT INTO employees (
        employee_id, full_name, department_id, position_id, salary_type, basic_salary, upah_harian, join_date, birthday, status,
        remote_work_allowed, daily_segments,
        segment1_start, segment1_end, segment2_start, segment2_end,
        custom_work_start, custom_work_end
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, true), $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        employeeId,
        fullName,
        departmentId,
        positionId,
        salaryType || 'monthly',
        basicSalary ?? 0,
        upahHarian ?? 0,
        joinDate || new Date().toISOString().slice(0, 10),
        birthday || null,
        status || 'active',
        remoteWorkAllowed !== undefined ? Boolean(remoteWorkAllowed) : null,
        ds,
        ds === 2 ? segment1_start : null,
        ds === 2 ? segment1_end : null,
        ds === 2 ? segment2_start : null,
        ds === 2 ? segment2_end : null,
        custom_work_start || null,
        custom_work_end || null,
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

  async assignDefaultShiftIfMissing(employeePk, exec = query) {
    await exec(
      `INSERT INTO employee_shifts (employee_id, shift_id, effective_from)
       SELECT $1, s.id, DATE '1970-01-01'
       FROM (SELECT id FROM shifts WHERE shift_name = 'Standard 7–4' LIMIT 1) s
       WHERE NOT EXISTS (SELECT 1 FROM employee_shifts es WHERE es.employee_id = $1)`,
      [employeePk]
    );
  }

  /** Two-clock employees always use Standard 7–4 in employee_shifts (for display / consistency). */
  async enforceStandardShift(employeePk, exec = query) {
    await this.assignDefaultShiftIfMissing(employeePk, exec);
    await exec(
      `UPDATE employee_shifts es
       SET shift_id = (SELECT id FROM shifts WHERE shift_name = 'Standard 7–4' LIMIT 1)
       WHERE es.employee_id = $1`,
      [employeePk]
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

  async updateEnterpriseFields(id, {
    photo_url,
    contract_status,
    department_id,
    position_id,
    join_date,
    birthday,
    remote_work_allowed,
    daily_segments,
    segment1_start,
    segment1_end,
    segment2_start,
    segment2_end,
    custom_work_start,
    custom_work_end,
  }) {
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
    if (join_date !== undefined) {
      sets.push(`join_date = $${i++}`);
      vals.push(join_date);
    }
    if (birthday !== undefined) {
      sets.push(`birthday = $${i++}`);
      vals.push(birthday);
    }
    if (remote_work_allowed !== undefined) {
      sets.push(`remote_work_allowed = $${i++}`);
      vals.push(Boolean(remote_work_allowed));
    }
    if (daily_segments !== undefined) {
      const ds = Number(daily_segments) === 2 ? 2 : 1;
      sets.push(`daily_segments = $${i++}`);
      vals.push(ds);
    }
    if (segment1_start !== undefined) {
      sets.push(`segment1_start = $${i++}`);
      vals.push(segment1_start);
    }
    if (segment1_end !== undefined) {
      sets.push(`segment1_end = $${i++}`);
      vals.push(segment1_end);
    }
    if (segment2_start !== undefined) {
      sets.push(`segment2_start = $${i++}`);
      vals.push(segment2_start);
    }
    if (segment2_end !== undefined) {
      sets.push(`segment2_end = $${i++}`);
      vals.push(segment2_end);
    }
    if (custom_work_start !== undefined) {
      sets.push(`custom_work_start = $${i++}`);
      vals.push(custom_work_start);
    }
    if (custom_work_end !== undefined) {
      sets.push(`custom_work_end = $${i++}`);
      vals.push(custom_work_end);
    }
    if (!sets.length) return this.findById(id);
    vals.push(id);
    const r = await query(
      `UPDATE employees SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    return r.rows[0] || null;
  }

  async updatePayrollDefaults(
    id,
    {
      tunjangan_masa_kerja,
      transport_eligible,
      upah_harian,
      basic_salary,
      transport_allowance_amount,
      diligence_allowance_amount,
    }
  ) {
    const sets = [];
    const vals = [];
    let i = 1;
    if (tunjangan_masa_kerja !== undefined) {
      sets.push(`tunjangan_masa_kerja = $${i++}`);
      vals.push(Number(tunjangan_masa_kerja) || 0);
    }
    if (basic_salary !== undefined) {
      sets.push(`basic_salary = $${i++}`);
      vals.push(Math.max(0, Number(basic_salary) || 0));
    }
    if (upah_harian !== undefined) {
      sets.push(`upah_harian = $${i++}`);
      vals.push(Number(upah_harian) || 0);
    }
    if (transport_eligible !== undefined) {
      sets.push(`transport_eligible = $${i++}`);
      vals.push(Boolean(transport_eligible));
    }
    if (transport_allowance_amount !== undefined) {
      sets.push(`transport_allowance_amount = $${i++}`);
      vals.push(Math.max(0, Number(transport_allowance_amount) || 0));
    }
    if (diligence_allowance_amount !== undefined) {
      sets.push(`diligence_allowance_amount = $${i++}`);
      vals.push(Math.max(0, Number(diligence_allowance_amount) || 0));
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
