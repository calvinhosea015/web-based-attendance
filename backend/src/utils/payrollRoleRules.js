const { isAccounting, isStaffKantor, isGeneralAffairs } = require('../constants/roles');

function hasMonthlyBasicPayroll(role) {
  return isStaffKantor(role) || isGeneralAffairs(role) || isAccounting(role);
}

/** Monthly gaji with potongan absen = gaji / hari kerja × hari absen. */
function receivesMonthlyAbsenceDeduction(role) {
  return isStaffKantor(role) || isGeneralAffairs(role);
}

/** Staff Kantor only — auto lembur, auto potongan terlambat. */
function receivesStaffKantorAttendancePayroll(role) {
  return isStaffKantor(role);
}

function applyAccountingPayrollFields(fields) {
  return {
    ...fields,
    tunjangan_masa_kerja: 0,
    transport_eligible: false,
    transport_allowance_amount: 0,
    overtime_pay: 0,
    insentif: 0,
    diligence_eligible: false,
    diligence_allowance_amount: 0,
    late_deduction: 0,
  };
}

function normalizeRolePayrollFields(fields, role) {
  if (!isAccounting(role)) return fields;
  return applyAccountingPayrollFields(fields);
}

module.exports = {
  hasMonthlyBasicPayroll,
  receivesMonthlyAbsenceDeduction,
  receivesStaffKantorAttendancePayroll,
  applyAccountingPayrollFields,
  normalizeRolePayrollFields,
};
