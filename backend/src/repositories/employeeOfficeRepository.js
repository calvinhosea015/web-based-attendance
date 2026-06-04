const { query } = require('../db/pool');

class EmployeeOfficeRepository {
  async listOfficeIdsByEmployee(employeeId) {
    const r = await query(
      `SELECT office_id FROM employee_offices WHERE employee_id = $1 ORDER BY office_id ASC`,
      [employeeId]
    );
    return r.rows.map((row) => Number(row.office_id));
  }

  async listOfficesByEmployee(employeeId) {
    const r = await query(
      `SELECT o.id, o.name, o.lat, o.lng, o.link
       FROM employee_offices eo
       JOIN offices o ON o.id = eo.office_id
       WHERE eo.employee_id = $1
       ORDER BY o.name ASC`,
      [employeeId]
    );
    return r.rows.map((row) => ({
      id: row.id,
      name: row.name,
      lat: row.lat != null ? Number(row.lat) : null,
      lng: row.lng != null ? Number(row.lng) : null,
      link: row.link,
    }));
  }

  async setOffices(employeeId, officeIds) {
    const unique = [...new Set(officeIds.map((id) => Number(id)).filter((id) => id >= 1))];
    await query(`DELETE FROM employee_offices WHERE employee_id = $1`, [employeeId]);
    for (const officeId of unique) {
      await query(
        `INSERT INTO employee_offices (employee_id, office_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [employeeId, officeId]
      );
    }
    return unique;
  }

  async mapOfficeIdsByEmployees(employeeIds) {
    if (!employeeIds.length) return new Map();
    const r = await query(
      `SELECT employee_id, office_id FROM employee_offices
       WHERE employee_id = ANY($1::int[])
       ORDER BY employee_id, office_id`,
      [employeeIds]
    );
    const map = new Map();
    for (const row of r.rows) {
      const empId = Number(row.employee_id);
      if (!map.has(empId)) map.set(empId, []);
      map.get(empId).push(Number(row.office_id));
    }
    return map;
  }
}

module.exports = { EmployeeOfficeRepository };
