/** Stored user.role values */
const ROLES = {
  ADMIN: 'admin',
  /** Pegawai — office staff with attendance */
  EMPLOYEE: 'employee',
  /** Petugas lapangan — one check-in per day; checkout requires structured delivery data */
  FIELD_OFFICER: 'field_officer',
  /** Umum — one check-in per day (auto close); monthly gaji; potongan absen = gaji/hari kerja × hari absen */
  UMUM: 'umum',
  /** Accounting — monthly gaji like Staff Kantor; custom work hours; potongan absen from attendance */
  ACCOUNTING: 'accounting',
  /** Head of Finance — no attendance; slip gaji filled manually by admin */
  HEAD_OF_FINANCE: 'head_of_finance',
};

const VALID_ROLES = Object.values(ROLES);

/** Roles that clock in/out and use the staff dashboard */
const ATTENDANCE_ROLES = [
  ROLES.EMPLOYEE,
  ROLES.FIELD_OFFICER,
  ROLES.UMUM,
  ROLES.ACCOUNTING,
];

function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

function isAttendanceRole(role) {
  return ATTENDANCE_ROLES.includes(role);
}

function isFieldOfficer(role) {
  return role === ROLES.FIELD_OFFICER;
}

/** Petugas lapangan may be assigned to multiple check-in locations. */
function usesMultipleOffices(role) {
  return isFieldOfficer(role);
}

/** Staff Kantor — office employee (not field officer or umum). */
function isStaffKantor(role) {
  return role === ROLES.EMPLOYEE;
}

function isUmum(role) {
  return role === ROLES.UMUM;
}

function isAccounting(role) {
  return role === ROLES.ACCOUNTING;
}

/** One check-in and one check-out per day (petugas lapangan only). */
function usesOncePerDayInOut(role) {
  return isFieldOfficer(role);
}

function isHeadOfFinance(role) {
  return role === ROLES.HEAD_OF_FINANCE;
}

/** Linked employee profile for payroll (attendance roles + head of finance). */
function requiresLinkedEmployee(role) {
  return isAttendanceRole(role) || isHeadOfFinance(role);
}

/** No clock-in; admin enters payroll manually. */
function isPayrollOnlyRole(role) {
  return isHeadOfFinance(role);
}

/** Pegawai, petugas lapangan, umum, accounting, head of finance require a display name. */
function requiresFullName(role) {
  return requiresLinkedEmployee(role);
}

/** May open employee dashboard to view payslips (not admin). */
function canAccessEmployeePayrollPortal(role) {
  return isAttendanceRole(role) || isHeadOfFinance(role);
}

module.exports = {
  ROLES,
  VALID_ROLES,
  ATTENDANCE_ROLES,
  isValidRole,
  isAttendanceRole,
  isFieldOfficer,
  usesMultipleOffices,
  isStaffKantor,
  isUmum,
  isAccounting,
  isHeadOfFinance,
  requiresLinkedEmployee,
  isPayrollOnlyRole,
  usesOncePerDayInOut,
  requiresFullName,
  canAccessEmployeePayrollPortal,
};
