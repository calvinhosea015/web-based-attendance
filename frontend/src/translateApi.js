import i18n from './i18n.js';

const MESSAGE_CODE = {
  'Invalid credentials': 'INVALID_CREDENTIALS',
  'Refresh token required.': 'REFRESH_REQUIRED',
  'Invalid or expired refresh token.': 'REFRESH_INVALID',
  'User not found.': 'USER_MISSING',
  'No token provided.': 'NO_TOKEN',
  'Access token expired.': 'TOKEN_EXPIRED',
  'Failed to authenticate token.': 'AUTH_FAILED',
  Forbidden: 'FORBIDDEN',
  'Admin accounts cannot be deleted.': 'CANNOT_DELETE_ADMIN',
  'Invalid or missing CSRF token.': 'CSRF',
  'Internal server error': 'INTERNAL_ERROR',
  'Office name and Google Maps link are required.': 'OFFICE_FIELDS',
  'Could not resolve map link': 'MAP_LINK',
  'Could not parse coordinates from the Google Maps link.': 'MAP_PARSE',
  'Account is not linked to an employee profile.': 'NO_EMPLOYEE',
  'Latitude and longitude are required.': 'GEO_REQUIRED',
  'GPS accuracy is required and must be positive.': 'GPS_ACCURACY_REQUIRED',
  'Device timestamp is required for clock events.': 'CLIENT_TS_REQUIRED',
  'Device clock does not match server time.': 'CLOCK_SKEW',
  'Movement speed from last fix is not physically plausible.': 'SPEED_REJECTED',
  'Invalid status.': 'STATUS',
  'Request not found.': 'NOT_FOUND',
  'Send all four segment times together.': 'SPLIT_SHIFT_TIMES',
  'Four shift times (segment1_start, segment1_end, segment2_start, segment2_end) are required for four clocks per day.':
    'SPLIT_SHIFT_TIMES_REQUIRED',
  'Invalid time format. Use HH:MM or HH:MM:SS.': 'BAD_TIME',
  'Invalid clock time.': 'BAD_TIME',
  'Username, password, and role are required.': 'USER_FIELDS',
  'Invalid role.': 'ROLE',
  'Employees require an assigned office (office_id).': 'OFFICE_REQUIRED',
  'Employees require full_name.': 'EMPLOYEE_FIELDS',
  'full_name is required for Staff Kantor and Petugas Lapangan.': 'EMPLOYEE_FIELDS',
  'full_name is required for pegawai and petugas lapangan.': 'EMPLOYEE_FIELDS',
  'Username or employee id already exists.': 'DUPLICATE',
  'Password is required': 'PASSWORD',
  'Password is required.': 'PASSWORD',
  'Only linked employees can clock in.': 'NOT_EMPLOYEE',
  'Only linked employees can clock out.': 'NOT_EMPLOYEE',
  'No office is assigned to your account. Ask an admin to assign an office before clocking in.': 'NO_OFFICE',
  'Remote check-in is not enabled for your account.': 'REMOTE_NOT_ALLOWED',
  'You still have an open session. Clock out before starting another.': 'ALREADY_IN',
  'All clock sessions for today are already complete.': 'DAY_COMPLETE',
  'Attendance for today is already complete.': 'DAY_COMPLETE',
  'You can only check in once per day. Check out first if you are still on duty, or you have already finished today.':
    'FIELD_ONE_CHECKIN',
  'Custom work hours are not configured. Ask an admin to set your work schedule.':
    'CUSTOM_WORK_HOURS_REQUIRED',
  'Work start and end times are required (HH:MM).': 'CUSTOM_WORK_HOURS_REQUIRED',
  'Work end time must be after start time.': 'CUSTOM_WORK_HOURS_REQUIRED',
  'Check-out is not required for your role.': 'CHECKOUT_NOT_REQUIRED',
  'Checkout code is required to check out.': 'CHECKOUT_CODE_REQUIRED',
  'Checkout data is required to check out.': 'CHECKOUT_CODE_REQUIRED',
  'Selected office not found.': 'OFFICE_NOT_FOUND',
  'Office not found.': 'OFFICE_NOT_FOUND',
  'Selected office has no Google Maps link. Add a map link to the office first.':
    'OFFICE_NO_MAP',
  'This office has no map coordinates. Ask an admin to recreate the office from a valid Google Maps link.':
    'OFFICE_COORDS',
  'You are not within the allowed radius of your assigned office. Wait for a better GPS fix or ask an admin to adjust the office map pin or OFFICE_RADIUS_METERS.':
    'RADIUS',
  'No check-in found for today.': 'NO_OPEN',
  'Could not complete checkout.': 'CHECKOUT_CONFLICT',
  'Invalid checkout keyword.': 'INVALID_CHECKOUT_CODE',
  'Checkout keyword already recorded for today.': 'FIELD_CODE_ALREADY',
  'Checkout keyword accepted for today.': 'FIELD_CODE_ACCEPTED',
  'Checkout data already recorded for today.': 'FIELD_CODE_ALREADY',
  'Checkout data accepted for today.': 'FIELD_CODE_ACCEPTED',
  'Only field officers can submit the checkout keyword.': 'NOT_FIELD_OFFICER',
  'Only field officers can submit checkout data.': 'NOT_FIELD_OFFICER',
  'Checkout phrase is too long.': 'CHECKOUT_CODE_TOO_LONG',
  'Checkout data is too long.': 'CHECKOUT_CODE_TOO_LONG',
  'Enter checkout data (9 fields separated by *) before you can check out.': 'FIELD_CODE_REQUIRED',
  'Username cannot be empty.': 'USERNAME_EMPTY',
  'Username already exists.': 'USERNAME_EXISTS',
  'Invalid office_id.': 'OFFICE_ID_INVALID',
  'full_name cannot be empty.': 'FULL_NAME_EMPTY',
  'full_name is required when changing role to employee.': 'FULL_NAME_REQUIRED_ROLE',
  'full_name is required when changing role to Staff Kantor or Petugas Lapangan.':
    'FULL_NAME_REQUIRED_ROLE',
  'full_name is required when changing role to pegawai or petugas lapangan.':
    'FULL_NAME_REQUIRED_ROLE',
  'No office configured; create an office first.': 'NO_OFFICE_CONFIGURED',
  'Employee not found': 'EMPLOYEE_NOT_FOUND',
  'No payroll record for this employee in this period. Generate payroll first.':
    'PAYROLL_NOT_FOUND',
  'No payroll records for this period. Generate payroll first.': 'PAYROLL_NOT_FOUND',
  'Loan amount must be greater than zero.': 'LOAN_AMOUNT',
  'Monthly deduction must be greater than zero.': 'LOAN_DEDUCTION',
  'Monthly deduction cannot exceed loan amount.': 'LOAN_DEDUCTION',
  'You already have a pending loan request.': 'LOAN_PENDING',
  'Leave requests are only available for Staff Kantor.': 'FORBIDDEN',
  'Invalid leave type.': 'LEAVE_TYPE',
  'Invalid date range.': 'LEAVE_DATES',
  'End date must be on or after start date.': 'LEAVE_DATES',
  'Supporting document is required for medical leave.': 'LEAVE_ATTACHMENT',
  'Only image files are allowed.': 'LEAVE_ATTACHMENT_TYPE',
  'File is too large (max 5 MB).': 'LEAVE_ATTACHMENT_SIZE',
  'Insufficient medical leave balance. Remaining:': 'LEAVE_BALANCE',
  'Insufficient unpaid leave balance. Remaining:': 'LEAVE_BALANCE',
  'Insufficient paternity leave balance. Remaining:': 'LEAVE_BALANCE',
  'You already have a pending leave request.': 'LEAVE_PENDING',
  'Dates overlap with an existing leave request.': 'LEAVE_OVERLAP',
  'Leave days must be zero or greater.': 'LEAVE_SETTINGS',
  'Choose whether paternity leave is paid or unpaid when approving.': 'LEAVE_PAID_REQUIRED',
  'Employee no longer has enough leave balance for this request.': 'LEAVE_BALANCE',
  'Request not found or already decided.': 'NOT_FOUND',
  'Password must contain only letters and numbers.': 'PASSWORD_ALPHANUMERIC',
  'Password must include uppercase, lowercase, a number, and a symbol.': 'PASSWORD_ALPHANUMERIC',
  'Send refreshToken in body, or authenticate to revoke all sessions.': 'LOGOUT_BODY',
};

function apiKey(code) {
  return `api.${code}`;
}

function translateByCode(code, params = {}) {
  const key = apiKey(code);
  if (code === 'RADIUS' && params.distance == null && i18n.exists('api.RADIUS_GENERIC')) {
    return i18n.t('api.RADIUS_GENERIC');
  }
  if (i18n.exists(key)) return i18n.t(key, params);
  return null;
}

function paramsFromResponse(data) {
  if (!data || typeof data !== 'object') return {};
  const out = {};
  if (data.distance_m != null) out.distance = data.distance_m;
  if (data.allowed_m != null) out.allowed = data.allowed_m;
  if (data.office_name) out.office = data.office_name;
  return out;
}

function paramsFromMessage(message) {
  if (!message || typeof message !== 'string') return {};
  let m = message.match(/^GPS accuracy must be better than (\d+)m\.$/);
  if (m) return { meters: m[1] };
  m = message.match(/^Password must be at least (\d+) characters\.$/);
  if (m) return { min: m[1] };
  m = message.match(/^Invalid checkout field: (.+)$/);
  if (m) return { detail: m[1] };
  m = message.match(
    /^Checkout data must have 9 fields separated by \* \(pabrik\*norek\*.*\)\.$/
  );
  if (m) return {};
  m = message.match(/^Validation failed: (.+)$/);
  if (m) return { detail: m[1] };
  if (message === 'Validation failed') return { detail: '' };
  return {};
}

function resolveCode(data) {
  if (data?.code) return data.code;
  const msg = data?.message;
  if (msg && MESSAGE_CODE[msg]) return MESSAGE_CODE[msg];
  return null;
}

export function translateApiMessage(input) {
  if (!input) return '';

  if (typeof input === 'string') {
    const code = MESSAGE_CODE[input];
    if (code) {
      const t = translateByCode(code, paramsFromMessage(input));
      if (t) return t;
    }
    const prefixed = input.startsWith('Validation failed:')
      ? translateByCode('VALIDATION_FAILED', paramsFromMessage(input))
      : null;
    if (prefixed) return prefixed;
    return input;
  }

  const data = input.response?.data ?? input;
  const { message, code: rawCode, errors } = data && typeof data === 'object' && !(data instanceof Blob)
    ? data
    : {};
  let code = rawCode || (message ? MESSAGE_CODE[message] : null);
  if (code === 'PASSWORD_POLICY' && message) {
    if (/must be at least \d+ characters/.test(message)) code = 'PASSWORD_MIN_LENGTH';
    else if (/only letters and numbers|uppercase, lowercase/.test(message))
      code = 'PASSWORD_ALPHANUMERIC';
  }

  if (code) {
    const translated = translateByCode(code, {
      ...paramsFromMessage(message),
      ...paramsFromResponse(data),
    });
    if (translated) {
      if (Array.isArray(errors) && errors.length) {
        const details = errors
          .map((e) => e.msg || `${e.path || ''} ${e.msg || ''}`.trim())
          .filter(Boolean)
          .join(' · ');
        if (details) return `${translated} (${details})`;
      }
      return translated;
    }
  }

  if (message) {
    const fromMsg = translateApiMessage(message);
    if (fromMsg !== message) return fromMsg;
    if (message.startsWith('Validation failed')) {
      const t = translateByCode('VALIDATION_FAILED', paramsFromMessage(message));
      if (t) return t;
    }
  }

  return message || input.message || String(input);
}

export function translateAttendanceStatus(status) {
  if (status == null || status === '') return '';
  const key = `attendanceStatus.${status}`;
  return i18n.exists(key) ? i18n.t(key) : status;
}

export function translateRole(role) {
  if (role === 'admin') return i18n.t('roleAdmin');
  if (role === 'employee') return i18n.t('roleEmployee');
  if (role === 'field_officer') return i18n.t('roleFieldOfficer');
  if (role === 'umum') return i18n.t('roleUmum');
  if (role === 'accounting') return i18n.t('roleAccounting');
  if (role === 'general_affairs') return i18n.t('roleGeneralAffairs');
  if (role === 'head_of_finance') return i18n.t('roleHeadOfFinance');
  return role ?? '';
}
