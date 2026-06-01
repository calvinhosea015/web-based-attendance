/** Pegawai */
export const ROLE_EMPLOYEE = 'employee';
/** Petugas lapangan */
export const ROLE_FIELD_OFFICER = 'field_officer';
/** Umum — one check-in per day */
export const ROLE_UMUM = 'umum';
/** Accounting — custom work hours; simplified payroll */
export const ROLE_ACCOUNTING = 'accounting';
/** General Affairs — monthly gaji; potongan absen */
export const ROLE_GENERAL_AFFAIRS = 'general_affairs';
/** Head of Finance — no attendance; manual payroll */
export const ROLE_HEAD_OF_FINANCE = 'head_of_finance';
export const ROLE_ADMIN = 'admin';

export const ATTENDANCE_ROLES = [
  ROLE_EMPLOYEE,
  ROLE_FIELD_OFFICER,
  ROLE_UMUM,
  ROLE_ACCOUNTING,
  ROLE_GENERAL_AFFAIRS,
];

export function isAttendanceRole(role) {
  return ATTENDANCE_ROLES.includes(role);
}

export function isAccountingRole(role) {
  return role === ROLE_ACCOUNTING;
}

export function isGeneralAffairsRole(role) {
  return role === ROLE_GENERAL_AFFAIRS;
}

export function usesMonthlyAbsencePayroll(role) {
  return role === ROLE_EMPLOYEE || role === ROLE_GENERAL_AFFAIRS;
}

export function isHeadOfFinanceRole(role) {
  return role === ROLE_HEAD_OF_FINANCE;
}

export function isPayrollOnlyRole(role) {
  return isHeadOfFinanceRole(role);
}

export function canAccessEmployeePayrollPortal(role) {
  return isAttendanceRole(role) || isHeadOfFinanceRole(role);
}

/** Pegawai, petugas lapangan, and accounting require full name. */
export function requiresFullName(role) {
  return isAttendanceRole(role);
}
