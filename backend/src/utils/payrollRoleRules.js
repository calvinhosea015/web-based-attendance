const { isAccounting, isStaffKantor, isUmum } = require('../constants/roles');

function hasMonthlyBasicPayroll(role) {
  return isStaffKantor(role) || isUmum(role) || isAccounting(role);
}

/** Monthly gaji prorated: gaji × hari hadir ÷ hari wajib (Staff Kantor, Cleaning, Accounting). */
function receivesMonthlyAbsenceDeduction(role) {
  return isStaffKantor(role) || isUmum(role) || isAccounting(role);
}

/** Staff Kantor & Accounting — auto lembur, auto potongan terlambat (custom jam masuk).
 * Staff Kantor only also gets a separate potongan pulang awal at the same rate. */
function receivesStaffKantorAttendancePayroll(role) {
  return isStaffKantor(role) || isAccounting(role);
}

function normalizeRolePayrollFields(fields, _role) {
  return fields;
}

module.exports = {
  hasMonthlyBasicPayroll,
  receivesMonthlyAbsenceDeduction,
  receivesStaffKantorAttendancePayroll,
  normalizeRolePayrollFields,
};
