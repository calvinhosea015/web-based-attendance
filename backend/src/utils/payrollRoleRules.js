const { isAccounting, isStaffKantor, isUmum } = require('../constants/roles');

function hasMonthlyBasicPayroll(role) {
  return isStaffKantor(role) || isUmum(role) || isAccounting(role);
}

/** Monthly gaji with potongan absen = gaji / hari kerja × hari absen. */
function receivesMonthlyAbsenceDeduction(role) {
  return isStaffKantor(role) || isUmum(role) || isAccounting(role);
}

/** Staff Kantor & Accounting — auto lembur, auto potongan terlambat (custom jam masuk). */
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
