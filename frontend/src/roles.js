/** Pegawai */
export const ROLE_EMPLOYEE = 'employee';
/** Petugas lapangan */
export const ROLE_FIELD_OFFICER = 'field_officer';
/** Umum — one check-in per day */
export const ROLE_UMUM = 'umum';
export const ROLE_ADMIN = 'admin';

export const ATTENDANCE_ROLES = [ROLE_EMPLOYEE, ROLE_FIELD_OFFICER, ROLE_UMUM];

export function isAttendanceRole(role) {
  return ATTENDANCE_ROLES.includes(role);
}

/** Pegawai and petugas lapangan require full name. */
export function requiresFullName(role) {
  return isAttendanceRole(role);
}
