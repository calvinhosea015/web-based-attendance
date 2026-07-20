const { pool } = require('../db/pool');
const { findCheckInOffice, nearestAssignedOffice, allowedRadiusMeters } = require('../utils/officeAttendance');
const { resolveAssignedOfficesForEmployee } = require('../utils/employeeOffices');
const { validateClockGeoOrThrow } = require('../utils/geoTrust');
const { AppError } = require('../utils/errors');
const {
  ATTENDANCE_STATUSES,
  CLOCK_SEGMENTS_PER_DAY,
  ATTENDANCE_STATUS_BUFFER_MINUTES,
} = require('../constants/attendance');

const STATUS_BUFFER_MS = ATTENDANCE_STATUS_BUFFER_MINUTES * 60 * 1000;
const {
  isAttendanceRole,
  isFieldOfficer,
  isUmum,
  isAccounting,
  usesOncePerDayInOut,
  usesSimpleDailyCheckout,
} = require('../constants/roles');
const { customShiftFromEmployee } = require('../utils/customWorkShift');
const { computeStaffKantorOvertimeMinutes } = require('../utils/staffKantorOvertime');
const config = require('../config/env');
const { attendanceCalendarDayStr } = require('../utils/calendarDay');

/** Two clocks per day: fixed 07:15–16:00 with 60 min break (used for late / hours math, not DB-dependent). */
const STANDARD_TWO_CLOCK_SHIFT = {
  shift_name: 'Standard 7–4',
  start_time: '07:15:00',
  end_time: '16:00:00',
  break_duration: 60,
};

function resolveClientTimestampMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  return n;
}

function tzDateParts(baseDate, timeZone = config.attendanceCalendarTz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(baseDate);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function parseTzOffsetMs(offsetLabel) {
  // Examples: GMT+7, GMT+07:00, UTC-05:30
  const m = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(String(offsetLabel || '').trim());
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const hh = Number(m[2]) || 0;
  const mm = Number(m[3]) || 0;
  return sign * (hh * 60 + mm) * 60 * 1000;
}

function offsetAtInstantMs(instant, timeZone = config.attendanceCalendarTz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const label = parts.find((p) => p.type === 'timeZoneName')?.value;
  return parseTzOffsetMs(label);
}

function zonedTimeToUtcDate({ year, month, day, hour, minute, second }, timeZone) {
  // Start from UTC guess, then correct by tz offset at that instant.
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const first = utcGuess - offsetAtInstantMs(new Date(utcGuess), timeZone);
  const corrected = utcGuess - offsetAtInstantMs(new Date(first), timeZone);
  return new Date(corrected);
}

function parseShiftTimeOnDate(baseDate, timeStr) {
  const parts = String(timeStr).split(':');
  const hh = parseInt(parts[0], 10) || 0;
  const mm = parseInt(parts[1], 10) || 0;
  const ss = parseInt(parts[2], 10) || 0;
  const tz = config.attendanceCalendarTz || 'Asia/Jakarta';
  const ymd = tzDateParts(baseDate, tz);
  return zonedTimeToUtcDate(
    { year: ymd.year, month: ymd.month, day: ymd.day, hour: hh, minute: mm, second: ss },
    tz
  );
}

function computeLateAndStatus(checkInIso, shift) {
  if (!shift) {
    return { lateMinutes: 0, status: ATTENDANCE_STATUSES.PRESENT };
  }
  const ci = new Date(checkInIso);
  const start = parseShiftTimeOnDate(ci, shift.start_time);
  const diffMs = ci.getTime() - start.getTime();
  if (diffMs <= STATUS_BUFFER_MS) {
    return { lateMinutes: 0, status: ATTENDANCE_STATUSES.PRESENT };
  }
  return {
    lateMinutes: Math.floor(diffMs / 60000),
    status: ATTENDANCE_STATUSES.LATE,
  };
}

function formatTimeForShift(t) {
  if (t == null) return null;
  const s = String(t);
  if (s.length >= 8) return s.slice(0, 8);
  if (s.length >= 5) return `${s.slice(0, 5)}:00`;
  return s;
}

/** Four clocks: morning / afternoon bounds from employee row (defaults if unset). */
function splitSegmentBounds(emp) {
  return {
    seg0: {
      start: formatTimeForShift(emp.segment1_start) || '07:00:00',
      end: formatTimeForShift(emp.segment1_end) || '12:00:00',
    },
    seg1: {
      start: formatTimeForShift(emp.segment2_start) || '13:00:00',
      end: formatTimeForShift(emp.segment2_end) || '16:00:00',
    },
  };
}

function computeSegmentCheckout(checkInIso, checkOutIso, segmentStartTime, segmentEndTime, previousStatus) {
  const ci = new Date(checkInIso);
  const co = new Date(checkOutIso);
  const rawHours = (co.getTime() - ci.getTime()) / 3600000;
  const workHours = Math.max(0, rawHours);
  let status = previousStatus || ATTENDANCE_STATUSES.PRESENT;
  const end = parseShiftTimeOnDate(co, segmentEndTime);
  if (co.getTime() < end.getTime() - STATUS_BUFFER_MS) {
    status = ATTENDANCE_STATUSES.EARLY_LEAVE;
  }
  const scheduledMs =
    parseShiftTimeOnDate(ci, segmentEndTime).getTime() -
    parseShiftTimeOnDate(ci, segmentStartTime).getTime();
  const scheduledHours = Math.max(0.25, scheduledMs / 3600000);
  const overtimeHours = Math.max(0, workHours - scheduledHours);
  return {
    workHours: Number(workHours.toFixed(2)),
    overtimeHours: Number(overtimeHours.toFixed(2)),
    status,
  };
}

function computeWorkAndCheckoutStatus(checkInIso, checkOutIso, shift, previousStatus, opts = {}) {
  const ci = new Date(checkInIso);
  const co = new Date(checkOutIso);
  const rawHours = (co.getTime() - ci.getTime()) / 3600000;
  const lunchH = shift ? shift.break_duration / 60 : 0;
  const breakH = opts.skipBreakDeduction ? 0 : shift ? lunchH : 1;
  const workHours = Math.max(0, rawHours - breakH);
  let status = previousStatus || ATTENDANCE_STATUSES.PRESENT;
  if (shift) {
    const end = parseShiftTimeOnDate(co, shift.end_time);
    if (co.getTime() < end.getTime() - STATUS_BUFFER_MS) {
      status = ATTENDANCE_STATUSES.EARLY_LEAVE;
    }
  }
  const fullSpanH = shift
    ? (parseShiftTimeOnDate(ci, shift.end_time).getTime() - parseShiftTimeOnDate(ci, shift.start_time).getTime()) /
      3600000
    : 9;
  const scheduledHours = opts.skipBreakDeduction
    ? Math.max(0.25, (fullSpanH - lunchH) / 2)
    : shift
      ? fullSpanH - lunchH
      : 8;
  const overtimeHours = Math.max(0, workHours - Math.max(scheduledHours, 0));
  return { workHours: Number(workHours.toFixed(2)), overtimeHours: Number(overtimeHours.toFixed(2)), status };
}

/** Staff Kantor checkout: standard work hours + lembur minutes (from 16:00 if out after 16:30). */
function computeStaffKantorCheckout(checkInIso, checkOutIso, previousStatus) {
  const base = computeWorkAndCheckoutStatus(
    checkInIso,
    checkOutIso,
    STANDARD_TWO_CLOCK_SHIFT,
    previousStatus,
    { skipBreakDeduction: false }
  );
  const overtimeMinutes = computeStaffKantorOvertimeMinutes(checkOutIso);
  return {
    ...base,
    overtimeMinutes,
    overtimeHours: Number((overtimeMinutes / 60).toFixed(2)),
  };
}

class AttendanceService {
  constructor(
    attendanceRepository,
    officeRepository,
    employeeRepository,
    userRepository,
    fieldCheckoutCodeService = null,
    employeeOfficeRepository = null,
    employeePabrikRepository = null
  ) {
    this.attendanceRepository = attendanceRepository;
    this.officeRepository = officeRepository;
    this.employeeRepository = employeeRepository;
    this.userRepository = userRepository;
    this.fieldCheckoutCodeService = fieldCheckoutCodeService;
    this.employeeOfficeRepository = employeeOfficeRepository;
    this.employeePabrikRepository = employeePabrikRepository;
  }

  async checkIn(auth, body, reqMeta) {
    if (!isAttendanceRole(auth.role) || !auth.employeeId) {
      throw new AppError('Only linked employees can clock in.', 403, 'NOT_EMPLOYEE');
    }
    const userRow = await this.userRepository.findById(auth.userId);
    const fieldOfficer = isFieldOfficer(auth.role);
    const assignedOffices = await resolveAssignedOfficesForEmployee(
      this.employeeOfficeRepository,
      auth.employeeId,
      userRow,
      this.employeePabrikRepository
    );
    if (!assignedOffices.length) {
      throw new AppError(
        fieldOfficer
          ? 'No factory locations are assigned to your account. Ask an admin to assign factories linked to a location.'
          : 'No office is assigned to your account. Ask an admin to assign an office before clocking in.',
        400,
        'NO_OFFICE'
      );
    }
    const remoteWorkAllowed = userRow.remote_work_allowed !== false;

    const {
      lat,
      lng,
      accuracy_m: accuracyMeters,
      client_ts_ms: clientTimestampMsRaw,
      remote_work: remoteWorkRaw,
    } = body;
    const remoteWork = remoteWorkRaw === true || remoteWorkRaw === 'true';
    if (remoteWork && !remoteWorkAllowed) {
      throw new AppError('Remote check-in is not enabled for your account.', 403, 'REMOTE_NOT_ALLOWED');
    }
    const clientTimestampMs = resolveClientTimestampMs(clientTimestampMsRaw);

    const dayStr = attendanceCalendarDayStr();
    const open = await this.attendanceRepository.findOpenSession(auth.employeeId);
    if (open) {
      throw new AppError('You still have an open session. Clock out before starting another.', 400, 'ALREADY_IN');
    }

    const umum = isUmum(auth.role);
    const onceDailyInOut = usesOncePerDayInOut(auth.role);
    if (onceDailyInOut) {
      const segCount = await this.attendanceRepository.countTodaySegments(auth.employeeId, dayStr);
      if (segCount >= 1) {
        throw new AppError(
          'You can only check in once per day. Check out first if you are still on duty, or you have already finished today.',
          400,
          'FIELD_ONE_CHECKIN'
        );
      }
    } else if (!umum) {
      const segCount = await this.attendanceRepository.countTodaySegments(auth.employeeId, dayStr);
      if (segCount >= CLOCK_SEGMENTS_PER_DAY) {
        throw new AppError('Attendance for today is already complete.', 400, 'DAY_COMPLETE');
      }
    }

    const last = await this.attendanceRepository.lastCompletedLocation(auth.employeeId);
    const geo = validateClockGeoOrThrow(
      {
        lat,
        lng,
        accuracyMeters,
        clientTimestampMs,
        lastLat: last?.lat,
        lastLng: last?.lng,
        lastClientTimestampMs: last?.ts,
      },
      config
    );

    const officesWithCoords = assignedOffices.filter(
      (o) =>
        o.lat != null &&
        o.lng != null &&
        !Number.isNaN(Number(o.lat)) &&
        !Number.isNaN(Number(o.lng))
    );
    if (!remoteWork && !officesWithCoords.length) {
      throw new AppError(
        'Your assigned location(s) have no map coordinates. Ask an admin to update the office Google Maps link.',
        400,
        'OFFICE_COORDS'
      );
    }

    let officeId;
    let office;
    if (!remoteWork) {
      const match = findCheckInOffice(lat, lng, accuracyMeters, officesWithCoords, config);
      if (!match) {
        const nearest = nearestAssignedOffice(lat, lng, officesWithCoords);
        const allowed = Math.round(allowedRadiusMeters(accuracyMeters, config, nearest?.office));
        throw new AppError(
          fieldOfficer
            ? 'You are not within the allowed radius of any of your assigned work locations. Wait for a better GPS fix or move closer to an assigned site.'
            : 'You are not within the allowed radius of your assigned office. Wait for a better GPS fix or ask an admin to adjust the office map pin or OFFICE_RADIUS_METERS.',
          400,
          'RADIUS',
          {
            distance_m: nearest ? Math.round(nearest.distance_m) : null,
            allowed_m: allowed,
            office_name: nearest?.office?.name || '',
            assigned_location_count: assignedOffices.length,
          }
        );
      }
      office = match.office;
      officeId = match.office.id;
    } else {
      office = assignedOffices[0];
      officeId = office.id;
      const row = await this.officeRepository.findById(officeId);
      if (!row) throw new AppError('Selected office not found.', 400, 'OFFICE_NOT_FOUND');
      office = { id: row.id, name: row.name, lat: row.lat, lng: row.lng };
    }

    const checkInTime = new Date();
    let lateMinutes = 0;
    let attendanceStatus = ATTENDANCE_STATUSES.PRESENT;
    if (onceDailyInOut || umum) {
      if (remoteWork) attendanceStatus = ATTENDANCE_STATUSES.REMOTE_WORK;
    } else if (isAccounting(auth.role)) {
      const emp = await this.employeeRepository.findById(auth.employeeId);
      const shift = customShiftFromEmployee(emp);
      if (!shift) {
        throw new AppError(
          'Custom work hours are not configured. Ask an admin to set your work schedule.',
          400,
          'CUSTOM_WORK_HOURS_REQUIRED'
        );
      }
      const late = computeLateAndStatus(checkInTime.toISOString(), shift);
      lateMinutes = late.lateMinutes;
      attendanceStatus = remoteWork ? ATTENDANCE_STATUSES.REMOTE_WORK : late.status;
    } else {
      const late = computeLateAndStatus(checkInTime.toISOString(), STANDARD_TWO_CLOCK_SHIFT);
      lateMinutes = late.lateMinutes;
      attendanceStatus = remoteWork ? ATTENDANCE_STATUSES.REMOTE_WORK : late.status;
    }

    // ponytail: umum needs insert+auto-checkout atomically; others are a single INSERT
    const insertArgs = {
      employeeId: auth.employeeId,
      officeId,
      latIn: lat,
      lngIn: lng,
      gpsAccuracyInM: accuracyMeters,
      clientTsIn: clientTimestampMs,
      ipIn: reqMeta.ip,
      userAgentIn: reqMeta.userAgent,
      attendanceStatus,
      lateMinutes,
      validationFlags: {
        geo_flags: geo.flags,
        fake_gps_hints: geo.fakeGpsHints,
        remote_work: remoteWork,
      },
    };

    if (umum) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const exec = (text, params) => client.query(text, params);
        const row = await this.attendanceRepository.insertCheckIn(insertArgs, exec);
        const closed = await this.attendanceRepository.checkoutRow(row.id, {
          latOut: lat,
          lngOut: lng,
          gpsAccuracyOutM: accuracyMeters,
          clientTsOut: clientTimestampMs,
          ipOut: reqMeta.ip,
          userAgentOut: reqMeta.userAgent,
          workHours: 0,
          overtimeHours: 0,
          attendanceStatus: row.attendance_status,
          checkoutCode: null,
          validationFlagsOut: {
            umum_auto_checkout: true,
            checkout_geo_flags: geo.flags,
            checkout_fake_gps_hints: geo.fakeGpsHints,
          },
        }, exec);
        await client.query('COMMIT');
        return { message: 'Checked in successfully.', attendance: closed || row };
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }

    const row = await this.attendanceRepository.insertCheckIn(insertArgs);
    return { message: 'Checked in successfully.', attendance: row };
  }

  async checkOut(auth, body, reqMeta) {
    if (!isAttendanceRole(auth.role) || !auth.employeeId) {
      throw new AppError('Only linked employees can clock out.', 403, 'NOT_EMPLOYEE');
    }
    if (isUmum(auth.role)) {
      throw new AppError('Check-out is not required for your role.', 400, 'CHECKOUT_NOT_REQUIRED');
    }
    const open = await this.attendanceRepository.findOpenSession(auth.employeeId);
    if (!open) {
      throw new AppError('No check-in found for today.', 400, 'NO_OPEN');
    }

    const {
      lat,
      lng,
      accuracy_m: accuracyMeters,
      client_ts_ms: clientTimestampMsRaw,
      checkout_code: checkoutCodeRaw,
    } = body;
    const fieldOfficer = isFieldOfficer(auth.role);
    // Field officers check out without entering anything; delivery data (data pengiriman)
    // is submitted separately via the field-code endpoint. An optional checkout_code is
    // still recorded if one happens to be sent.
    if (fieldOfficer && checkoutCodeRaw && this.fieldCheckoutCodeService) {
      await this.fieldCheckoutCodeService.assertReadyForCheckout(auth, checkoutCodeRaw);
    }
    const clientTimestampMs = resolveClientTimestampMs(clientTimestampMsRaw);
    const geo = validateClockGeoOrThrow(
      {
        lat,
        lng,
        accuracyMeters,
        clientTimestampMs,
        lastLat: null,
        lastLng: null,
        lastClientTimestampMs: null,
      },
      config
    );

    const nowIso = new Date().toISOString();
    const checkInIso = new Date(open.check_in).toISOString();
    let workHours;
    let overtimeHours;
    let overtimeMinutes = 0;
    let status;
    let checkoutCode = null;
    if (usesSimpleDailyCheckout(auth.role)) {
      checkoutCode =
        checkoutCodeRaw != null && String(checkoutCodeRaw).trim() !== ''
          ? String(checkoutCodeRaw).trim()
          : null;
      const rawHours = (new Date(nowIso).getTime() - new Date(checkInIso).getTime()) / 3600000;
      workHours = Number(Math.max(0, rawHours).toFixed(2));
      overtimeHours = 0;
      status = open.attendance_status || ATTENDANCE_STATUSES.PRESENT;
    } else if (isAccounting(auth.role)) {
      const emp = await this.employeeRepository.findById(auth.employeeId);
      const shift = customShiftFromEmployee(emp);
      const w = computeWorkAndCheckoutStatus(checkInIso, nowIso, shift, open.attendance_status, {
        skipBreakDeduction: true,
      });
      workHours = w.workHours;
      overtimeHours = 0;
      overtimeMinutes = 0;
      status = w.status;
    } else {
      const w = computeStaffKantorCheckout(checkInIso, nowIso, open.attendance_status);
      workHours = w.workHours;
      overtimeHours = w.overtimeHours;
      overtimeMinutes = w.overtimeMinutes;
      status = w.status;
    }

    const updated = await this.attendanceRepository.checkoutRow(open.id, {
      latOut: lat,
      lngOut: lng,
      gpsAccuracyOutM: accuracyMeters,
      clientTsOut: clientTimestampMs,
      ipOut: reqMeta.ip,
      userAgentOut: reqMeta.userAgent,
      workHours,
      overtimeHours,
      overtimeMinutes,
      attendanceStatus: status,
      checkoutCode,
      validationFlagsOut: {
        checkout_geo_flags: geo.flags,
        checkout_fake_gps_hints: geo.fakeGpsHints,
      },
    });
    if (!updated) {
      throw new AppError('Could not complete checkout.', 409, 'CHECKOUT_CONFLICT');
    }
    if (fieldOfficer && this.fieldCheckoutCodeService) {
      await this.fieldCheckoutCodeService.linkCheckout(auth, updated.id);
    }
    return { message: 'Checked out successfully.', attendance: updated };
  }

  async listMine(auth) {
    if (!auth.employeeId) return [];
    return this.attendanceRepository.listForEmployee(auth.employeeId);
  }

  async listAll() {
    return this.attendanceRepository.listAllWithJoins();
  }

  /**
   * Admin: attendance rows for the employee linked to a user account.
   * @param {number} userId
   * @param {number} [limit]
   */
  async listAttendanceForUser(userId, limit = 120) {
    const cap = Math.min(Math.max(Number(limit) || 120, 1), 500);
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }
    if (!user.employee_id) {
      return {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          employee_id: null,
          full_name: user.full_name || null,
          employee_code: user.employee_code || null,
        },
        attendance: [],
      };
    }
    const rows = await this.attendanceRepository.listForEmployeeWithJoins(user.employee_id, cap);
    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        employee_id: user.employee_id,
        full_name: user.full_name || null,
        employee_code: user.employee_code || null,
      },
      attendance: rows,
    };
  }

  async exportRows() {
    return this.attendanceRepository.listAllWithJoins();
  }

  async professionalReportRows(dateFrom, dateTo) {
    return this.attendanceRepository.professionalReport(dateFrom, dateTo);
  }

  async absenHjsSummaryRows(dateFrom, dateTo) {
    return this.attendanceRepository.absenHjsSummary(dateFrom, dateTo);
  }

  /**
   * Admin: adjust check-in / check-out timestamps and recalculate derived fields.
   * @param {number} attendanceId
   * @param {{ check_in?: string|null, check_out?: string|null }} body
   */
  async adminUpdateTimes(attendanceId, body) {
    const row = await this.attendanceRepository.findById(attendanceId);
    if (!row) {
      throw new AppError('Attendance record not found.', 404, 'ATTENDANCE_NOT_FOUND');
    }

    const hasCheckIn = Object.prototype.hasOwnProperty.call(body, 'check_in');
    const hasCheckOut = Object.prototype.hasOwnProperty.call(body, 'check_out');
    if (!hasCheckIn && !hasCheckOut) {
      throw new AppError('Provide check_in and/or check_out.', 400, 'NO_FIELDS');
    }

    const nextCheckIn = hasCheckIn ? new Date(body.check_in) : new Date(row.check_in);
    let nextCheckOut;
    if (!hasCheckOut) {
      nextCheckOut = row.check_out ? new Date(row.check_out) : null;
    } else if (body.check_out == null || body.check_out === '') {
      nextCheckOut = null;
    } else {
      nextCheckOut = new Date(body.check_out);
    }

    if (Number.isNaN(nextCheckIn.getTime())) {
      throw new AppError('Invalid check-in time.', 400, 'INVALID_CHECK_IN');
    }
    if (nextCheckOut && Number.isNaN(nextCheckOut.getTime())) {
      throw new AppError('Invalid check-out time.', 400, 'INVALID_CHECK_OUT');
    }
    if (nextCheckOut && nextCheckOut.getTime() < nextCheckIn.getTime()) {
      throw new AppError('Check-out must be after check-in.', 400, 'CHECKOUT_BEFORE_CHECKIN');
    }

    const userRow = await this.userRepository.findByEmployeeId(row.employee_id);
    const role = userRow?.role || 'employee';

    let flags = row.validation_flags;
    if (typeof flags === 'string') {
      try {
        flags = JSON.parse(flags);
      } catch {
        flags = {};
      }
    }
    if (!flags || typeof flags !== 'object') flags = {};
    const remoteWork = flags.remote_work === true;

    let lateMinutes = row.late_minutes || 0;
    let attendanceStatus = row.attendance_status;

    if (remoteWork) {
      attendanceStatus = ATTENDANCE_STATUSES.REMOTE_WORK;
    } else if (isUmum(role) || usesSimpleDailyCheckout(role)) {
      // Umum / field officer: no standard late window on check-in edit.
      if (!nextCheckOut) {
        attendanceStatus = ATTENDANCE_STATUSES.PRESENT;
      }
    } else if (isAccounting(role)) {
      const emp = await this.employeeRepository.findById(row.employee_id);
      const shift = customShiftFromEmployee(emp);
      const late = computeLateAndStatus(nextCheckIn.toISOString(), shift);
      lateMinutes = late.lateMinutes;
      attendanceStatus = late.status;
    } else {
      const late = computeLateAndStatus(nextCheckIn.toISOString(), STANDARD_TWO_CLOCK_SHIFT);
      lateMinutes = late.lateMinutes;
      attendanceStatus = late.status;
    }

    let workHours = null;
    let overtimeHours = null;
    let overtimeMinutes = 0;

    if (nextCheckOut) {
      const checkInIso = nextCheckIn.toISOString();
      const checkOutIso = nextCheckOut.toISOString();
      if (usesSimpleDailyCheckout(role)) {
        const rawHours = (nextCheckOut.getTime() - nextCheckIn.getTime()) / 3600000;
        workHours = Number(Math.max(0, rawHours).toFixed(2));
        overtimeHours = 0;
      } else if (isAccounting(role)) {
        const emp = await this.employeeRepository.findById(row.employee_id);
        const shift = customShiftFromEmployee(emp);
        const w = computeWorkAndCheckoutStatus(checkInIso, checkOutIso, shift, attendanceStatus, {
          skipBreakDeduction: true,
        });
        workHours = w.workHours;
        overtimeHours = 0;
        attendanceStatus = w.status;
      } else if (isUmum(role)) {
        workHours = Number(row.work_hours) || 0;
        overtimeHours = 0;
      } else {
        const w = computeStaffKantorCheckout(checkInIso, checkOutIso, attendanceStatus);
        workHours = w.workHours;
        overtimeHours = w.overtimeHours;
        overtimeMinutes = w.overtimeMinutes;
        attendanceStatus = w.status;
      }
    }

    const updated = await this.attendanceRepository.updateAdminTimes(attendanceId, {
      checkIn: nextCheckIn.toISOString(),
      checkOut: nextCheckOut ? nextCheckOut.toISOString() : null,
      lateMinutes,
      workHours,
      overtimeHours,
      overtimeMinutes,
      attendanceStatus,
      validationFlagsPatch: {
        admin_time_edit: true,
        admin_edited_at: new Date().toISOString(),
      },
    });
    if (!updated) {
      throw new AppError('Could not update attendance.', 409, 'UPDATE_FAILED');
    }

    return this.attendanceRepository.findByIdWithJoins(attendanceId);
  }
}

module.exports = { AttendanceService };
