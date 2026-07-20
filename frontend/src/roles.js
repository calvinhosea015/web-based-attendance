/** Pegawai */
export const ROLE_EMPLOYEE = 'employee';
/** Petugas lapangan */
export const ROLE_FIELD_OFFICER = 'field_officer';
/** General affairs — gaji harian like petugas lapangan */
export const ROLE_GENERAL_AFFAIRS = 'general_affairs';
/** Cleaning — one check-in per day; monthly gaji; potongan absen */
export const ROLE_UMUM = 'umum';
/** Accounting — custom work hours; simplified payroll */
export const ROLE_ACCOUNTING = 'accounting';
/** Head of Finance — no attendance; manual payroll */
export const ROLE_HEAD_OF_FINANCE = 'head_of_finance';
export const ROLE_ADMIN = 'admin';

export const ATTENDANCE_ROLES = [
  ROLE_EMPLOYEE,
  ROLE_FIELD_OFFICER,
  ROLE_GENERAL_AFFAIRS,
  ROLE_UMUM,
  ROLE_ACCOUNTING,
];

export function isAttendanceRole(role) {
  return ATTENDANCE_ROLES.includes(role);
}

export function isAccountingRole(role) {
  return role === ROLE_ACCOUNTING;
}

export function isUmumRole(role) {
  return role === ROLE_UMUM;
}

export function usesMonthlyAbsencePayroll(role) {
  return role === ROLE_EMPLOYEE || role === ROLE_UMUM;
}

export function isHeadOfFinanceRole(role) {
  return role === ROLE_HEAD_OF_FINANCE;
}

export function usesMultipleOfficesRole(role) {
  return role === ROLE_FIELD_OFFICER;
}

export function isPayrollOnlyRole(role) {
  return isHeadOfFinanceRole(role);
}

export function canAccessEmployeePayrollPortal(role) {
  return isAttendanceRole(role) || isHeadOfFinanceRole(role);
}

/** Omset from petugas lapangan delivery codes — admin & head of finance only. */
export function canViewFieldOmsetReport(role) {
  return role === ROLE_ADMIN || isHeadOfFinanceRole(role);
}

/** Attendance roles + head of finance require a display name (matches backend). */
export function requiresFullName(role) {
  return isAttendanceRole(role) || isHeadOfFinanceRole(role);
}

export function usesDailyWagePayrollRole(role) {
  return role === ROLE_FIELD_OFFICER || role === ROLE_GENERAL_AFFAIRS;
}

/** Monthly payroll UI modes (legacy DB rows may still carry payroll_mode general_affairs). */
export function isMonthlyPayrollMode(mode) {
  return mode === 'monthly' || mode === 'umum' || mode === 'accounting';
}
