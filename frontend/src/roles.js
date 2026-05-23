/** Pegawai */
export const ROLE_EMPLOYEE = 'employee';
/** Petugas lapangan */
export const ROLE_FIELD_OFFICER = 'field_officer';
export const ROLE_ADMIN = 'admin';

export const ATTENDANCE_ROLES = [ROLE_EMPLOYEE, ROLE_FIELD_OFFICER];

export function isAttendanceRole(role) {
  return ATTENDANCE_ROLES.includes(role);
}

/** Pegawai and petugas lapangan require full name. */
export function requiresFullName(role) {
  return isAttendanceRole(role);
}
