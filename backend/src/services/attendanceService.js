const { haversineMeters } = require('../utils/geo');
const { validateClockGeoOrThrow } = require('../utils/geoTrust');
const { AppError } = require('../utils/errors');
const { ATTENDANCE_STATUSES } = require('../constants/attendance');
const config = require('../config/env');

/** Two clocks per day: fixed 07:00–16:00 with 60 min break (used for late / hours math, not DB-dependent). */
const STANDARD_TWO_CLOCK_SHIFT = {
  shift_name: 'Standard 7–4',
  start_time: '07:00:00',
  end_time: '16:00:00',
  break_duration: 60,
};

function resolveClientTimestampMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  return n;
}

function parseShiftTimeOnDate(baseDate, timeStr) {
  const d = new Date(baseDate);
  const parts = String(timeStr).split(':');
  const hh = parseInt(parts[0], 10) || 0;
  const mm = parseInt(parts[1], 10) || 0;
  const ss = parseInt(parts[2], 10) || 0;
  d.setHours(hh, mm, ss, 0);
  return d;
}

function computeLateAndStatus(checkInIso, shift) {
  if (!shift) {
    return { lateMinutes: 0, status: ATTENDANCE_STATUSES.PRESENT };
  }
  const ci = new Date(checkInIso);
  const start = parseShiftTimeOnDate(ci, shift.start_time);
  const diffMs = ci.getTime() - start.getTime();
  if (diffMs <= 0) {
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
  if (co.getTime() < end.getTime() - 60 * 1000) {
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
    if (co.getTime() < end.getTime() - 60 * 1000) {
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

class AttendanceService {
  constructor(attendanceRepository, officeRepository, employeeRepository, userRepository) {
    this.attendanceRepository = attendanceRepository;
    this.officeRepository = officeRepository;
    this.employeeRepository = employeeRepository;
    this.userRepository = userRepository;
  }

  async checkIn(auth, body, reqMeta) {
    if (auth.role !== 'employee' || !auth.employeeId) {
      throw new AppError('Only linked employees can clock in.', 403, 'NOT_EMPLOYEE');
    }
    const userRow = await this.userRepository.findById(auth.userId);
    if (!userRow || !userRow.office_id) {
      throw new AppError(
        'No office is assigned to your account. Ask an admin to assign an office before clocking in.',
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

    const dayStr = new Date().toISOString().slice(0, 10);
    const open = await this.attendanceRepository.findOpenToday(auth.employeeId, dayStr);
    if (open) {
      throw new AppError('You still have an open session. Clock out before starting another.', 400, 'ALREADY_IN');
    }

    const emp = await this.employeeRepository.findById(auth.employeeId);
    const dailySegments = emp && Number(emp.daily_segments) === 2 ? 2 : 1;
    const segCount = await this.attendanceRepository.countTodaySegments(auth.employeeId, dayStr);
    if (segCount >= dailySegments) {
      throw new AppError('All clock sessions for today are already complete.', 400, 'DAY_COMPLETE');
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

    const officeId = userRow.office_id;
    const office = await this.officeRepository.findById(officeId);
    if (!office) throw new AppError('Selected office not found.', 400, 'OFFICE_NOT_FOUND');
    if (office.lat == null || office.lng == null || Number.isNaN(Number(office.lat)) || Number.isNaN(Number(office.lng))) {
      throw new AppError(
        'This office has no map coordinates. Ask an admin to recreate the office from a valid Google Maps link.',
        400,
        'OFFICE_COORDS'
      );
    }
    if (!remoteWork) {
      const dist = haversineMeters(Number(lat), Number(lng), Number(office.lat), Number(office.lng));
      const acc = Math.max(0, Number(accuracyMeters) || 0);
      const accBuffer = Math.min(acc, config.officeRadiusGpsBufferCapMeters);
      const allowed = config.officeRadiusMeters + accBuffer;
      if (dist > allowed) {
        throw new AppError(
          'You are not within the allowed radius of your assigned office. Wait for a better GPS fix or ask an admin to adjust the office map pin or OFFICE_RADIUS_METERS.',
          400,
          'RADIUS'
        );
      }
    }

    const checkInTime = new Date();
    const segmentIndex = segCount;
    let lateShift;
    if (dailySegments === 1) {
      lateShift = STANDARD_TWO_CLOCK_SHIFT;
    } else {
      const b = splitSegmentBounds(emp);
      lateShift = { start_time: segmentIndex === 0 ? b.seg0.start : b.seg1.start };
    }
    const late = computeLateAndStatus(checkInTime.toISOString(), lateShift);
    const lateMinutes = late.lateMinutes;
    let baseStatus = late.status;
    const attendanceStatus = remoteWork ? ATTENDANCE_STATUSES.REMOTE_WORK : baseStatus;

    const row = await this.attendanceRepository.insertCheckIn({
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
    });

    return { message: 'Checked in successfully.', attendance: row };
  }

  async checkOut(auth, body, reqMeta) {
    if (auth.role !== 'employee' || !auth.employeeId) {
      throw new AppError('Only linked employees can clock out.', 403, 'NOT_EMPLOYEE');
    }
    const dayStr = new Date().toISOString().slice(0, 10);
    const open = await this.attendanceRepository.findOpenToday(auth.employeeId, dayStr);
    if (!open) {
      throw new AppError('No check-in found for today.', 400, 'NO_OPEN');
    }

    const { lat, lng, accuracy_m: accuracyMeters, client_ts_ms: clientTimestampMsRaw } = body;
    const clientTimestampMs = resolveClientTimestampMs(clientTimestampMsRaw);
    const last = {
      lat: open.lat_in,
      lng: open.lng_in,
      ts: open.client_ts_in,
    };
    const geo = validateClockGeoOrThrow(
      {
        lat,
        lng,
        accuracyMeters,
        clientTimestampMs,
        lastLat: last.lat,
        lastLng: last.lng,
        lastClientTimestampMs: last.ts,
      },
      config
    );

    const emp = await this.employeeRepository.findById(auth.employeeId);
    const dailySegments = emp && Number(emp.daily_segments) === 2 ? 2 : 1;

    const nowIso = new Date().toISOString();
    const checkInIso = new Date(open.check_in).toISOString();
    let workHours;
    let overtimeHours;
    let status;
    if (dailySegments === 1) {
      const w = computeWorkAndCheckoutStatus(
        checkInIso,
        nowIso,
        STANDARD_TWO_CLOCK_SHIFT,
        open.attendance_status,
        { skipBreakDeduction: false }
      );
      ({ workHours, overtimeHours, status } = w);
    } else {
      const sessions = await this.attendanceRepository.listTodaySegments(auth.employeeId, dayStr);
      const segIdx = Math.max(
        0,
        sessions.findIndex((s) => s.id === open.id)
      );
      const b = splitSegmentBounds(emp);
      const seg = segIdx === 0 ? b.seg0 : b.seg1;
      const w = computeSegmentCheckout(
        checkInIso,
        nowIso,
        seg.start,
        seg.end,
        open.attendance_status
      );
      ({ workHours, overtimeHours, status } = w);
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
      attendanceStatus: status,
      validationFlagsOut: {
        checkout_geo_flags: geo.flags,
        checkout_fake_gps_hints: geo.fakeGpsHints,
      },
    });
    if (!updated) {
      throw new AppError('Could not complete checkout.', 409, 'CHECKOUT_CONFLICT');
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
}

module.exports = { AttendanceService };
