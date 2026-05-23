/** Stored user.role values */
const ROLES = {
  ADMIN: 'admin',
  /** Pegawai — office staff with attendance */
  EMPLOYEE: 'employee',
  /** Petugas lapangan — flexible hours; multiple in/out; checkout requires a code string */
  FIELD_OFFICER: 'field_officer',
};

const VALID_ROLES = Object.values(ROLES);

/** Roles that clock in/out and use the staff dashboard */
const ATTENDANCE_ROLES = [ROLES.EMPLOYEE, ROLES.FIELD_OFFICER];

function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

function isAttendanceRole(role) {
  return ATTENDANCE_ROLES.includes(role);
}

function isFieldOfficer(role) {
  return role === ROLES.FIELD_OFFICER;
}

/** Pegawai and petugas lapangan require a display name. */
function requiresFullName(role) {
  return isAttendanceRole(role);
}

module.exports = {
  ROLES,
  VALID_ROLES,
  ATTENDANCE_ROLES,
  isValidRole,
  isAttendanceRole,
  isFieldOfficer,
  requiresFullName,
};
