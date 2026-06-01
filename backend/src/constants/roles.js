/** Stored user.role values */
const ROLES = {
  ADMIN: 'admin',
  /** Pegawai — office staff with attendance */
  EMPLOYEE: 'employee',
  /** Petugas lapangan — one check-in per day; checkout requires structured delivery data */
  FIELD_OFFICER: 'field_officer',
  /** Umum — one check-in per day; no checkout; remote + geolocation on check-in */
  UMUM: 'umum',
  /** Accounting — monthly gaji pokok; custom work hours per user; simplified payroll */
  ACCOUNTING: 'accounting',
  /** General Affairs — one in/out per day; monthly gaji; potongan absen = gaji/hari kerja × hari absen */
  GENERAL_AFFAIRS: 'general_affairs',
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
  ROLES.GENERAL_AFFAIRS,
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

function isGeneralAffairs(role) {
  return role === ROLES.GENERAL_AFFAIRS;
}

/** One check-in and one check-out per day (petugas lapangan, general affairs). */
function usesOncePerDayInOut(role) {
  return isFieldOfficer(role) || isGeneralAffairs(role);
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

/** Pegawai, petugas lapangan, accounting, general affairs, head of finance require a display name. */
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
  isStaffKantor,
  isUmum,
  isAccounting,
  isGeneralAffairs,
  isHeadOfFinance,
  requiresLinkedEmployee,
  isPayrollOnlyRole,
  usesOncePerDayInOut,
  requiresFullName,
  canAccessEmployeePayrollPortal,
};
