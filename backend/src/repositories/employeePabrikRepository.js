const { query } = require('../db/pool');
const { mapOfficeRow } = require('../utils/employeeOffices');

class EmployeePabrikRepository {
  async listPabrikIdsByEmployee(employeeId) {
    const r = await query(
      `SELECT pabrik_id FROM employee_pabriks WHERE employee_id = $1 ORDER BY pabrik_id ASC`,
      [employeeId]
    );
    return r.rows.map((row) => Number(row.pabrik_id));
  }

  async listOfficesByEmployee(employeeId) {
    // When several assigned pabriks share an office, use the largest configured radius
    // among them (MAX ignores NULLs, so NULL falls back to the global default downstream).
    const r = await query(
      `SELECT o.id, o.name, o.lat, o.lng, o.link, MAX(p.radius_meters) AS radius_meters
       FROM employee_pabriks ep
       JOIN pabriks p ON p.id = ep.pabrik_id
       JOIN offices o ON o.id = p.office_id
       WHERE ep.employee_id = $1 AND p.office_id IS NOT NULL
       GROUP BY o.id
       ORDER BY o.name ASC`,
      [employeeId]
    );
    return r.rows.map(mapOfficeRow);
  }

  async resolveOfficeIdsFromPabrikIds(pabrikIds) {
    const ids = [...new Set(pabrikIds.map((id) => Number(id)).filter((id) => id >= 1))];
    if (!ids.length) return [];
    const r = await query(
      `SELECT DISTINCT p.office_id
       FROM pabriks p
       WHERE p.id = ANY($1::int[]) AND p.office_id IS NOT NULL
       ORDER BY p.office_id ASC`,
      [ids]
    );
    return r.rows.map((row) => Number(row.office_id));
  }

  async findPabriksWithoutOffice(pabrikIds) {
    const ids = [...new Set(pabrikIds.map((id) => Number(id)).filter((id) => id >= 1))];
    if (!ids.length) return [];
    const r = await query(
      `SELECT id, pabrik_code, nama_pabrik
       FROM pabriks
       WHERE id = ANY($1::int[]) AND office_id IS NULL
       ORDER BY pabrik_code ASC`,
      [ids]
    );
    return r.rows;
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
