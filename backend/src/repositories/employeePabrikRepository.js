const { query } = require('../db/pool');

class EmployeePabrikRepository {
  async listPabrikIdsByEmployee(employeeId) {
    const r = await query(
      `SELECT pabrik_id FROM employee_pabriks WHERE employee_id = $1 ORDER BY pabrik_id ASC`,
      [employeeId]
    );
    return r.rows.map((row) => Number(row.pabrik_id));
  }

  async listPabrikCodesByEmployee(employeeId) {
    const r = await query(
      `SELECT p.pabrik_code
       FROM employee_pabriks ep
       JOIN pabriks p ON p.id = ep.pabrik_id
       WHERE ep.employee_id = $1
       ORDER BY p.pabrik_code ASC`,
      [employeeId]
    );
    return r.rows.map((row) => String(row.pabrik_code));
  }

  async setPabriks(employeeId, pabrikIds) {
    const unique = [...new Set(pabrikIds.map((id) => Number(id)).filter((id) => id >= 1))];
    await query(`DELETE FROM employee_pabriks WHERE employee_id = $1`, [employeeId]);
    for (const pabrikId of unique) {
      await query(
        `INSERT INTO employee_pabriks (employee_id, pabrik_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [employeeId, pabrikId]
      );
    }
    return unique;
  }

  async mapPabrikIdsByEmployees(employeeIds) {
    if (!employeeIds.length) return new Map();
    const r = await query(
      `SELECT employee_id, pabrik_id FROM employee_pabriks
       WHERE employee_id = ANY($1::int[])
       ORDER BY employee_id, pabrik_id`,
      [employeeIds]
    );
    const map = new Map();
    for (const row of r.rows) {
      const empId = Number(row.employee_id);
      if (!map.has(empId)) map.set(empId, []);
      map.get(empId).push(Number(row.pabrik_id));
    }
    return map;
  }
}

module.exports = { EmployeePabrikRepository };
