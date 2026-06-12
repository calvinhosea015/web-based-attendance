const { isFieldOfficer } = require('../constants/roles');

function normalizeOfficeIdList(officeIds, officeId) {
  const raw = Array.isArray(officeIds) ? officeIds : [];
  const fromArray = raw
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n >= 1);
  if (fromArray.length) return [...new Set(fromArray)];
  const single = Number(officeId);
  if (Number.isFinite(single) && single >= 1) return [single];
  return [];
}

function mapOfficeRow(row) {
  return {
    id: row.id,
    name: row.name || '',
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    link: row.link ?? null,
  };
}

async function resolveAssignedOfficesForEmployee(
  employeeOfficeRepository,
  employeeId,
  userRow,
  employeePabrikRepository = null
) {
  if (!employeeId) return [];
  if (isFieldOfficer(userRow?.role) && employeePabrikRepository) {
    const offices = await employeePabrikRepository.listOfficesByEmployee(employeeId);
    if (offices.length) return offices;
    return [];
  }
  if (employeeOfficeRepository) {
    const offices = await employeeOfficeRepository.listOfficesByEmployee(employeeId);
    if (offices.length) return offices;
  }
  if (userRow?.office_id != null) {
    return [
      {
        id: userRow.office_id,
        name: userRow.assigned_office_name || '',
        lat:
          userRow.assigned_office_lat != null ? Number(userRow.assigned_office_lat) : null,
        lng:
          userRow.assigned_office_lng != null ? Number(userRow.assigned_office_lng) : null,
        link: null,
      },
    ];
  }
  return [];
}

function primaryOfficeFromList(offices) {
  return offices.length ? offices[0] : null;
}

module.exports = {
  normalizeOfficeIdList,
  mapOfficeRow,
  resolveAssignedOfficesForEmployee,
  primaryOfficeFromList,
};
