const { haversineMeters } = require('../utils/geo');
const { validateClockGeoOrThrow } = require('../utils/geoTrust');
const { AppError } = require('../utils/errors');
const { ATTENDANCE_STATUSES } = require('../constants/attendance');
const config = require('../config/env');

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

function computeWorkAndCheckoutStatus(checkInIso, checkOutIso, shift, previousStatus) {
  const ci = new Date(checkInIso);
  const co = new Date(checkOutIso);
  const rawHours = (co.getTime() - ci.getTime()) / 3600000;
  const breakH = shift ? shift.break_duration / 60 : 1;
  const workHours = Math.max(0, rawHours - breakH);
  let status = previousStatus || ATTENDANCE_STATUSES.PRESENT;
  if (shift) {
    const end = parseShiftTimeOnDate(co, shift.end_time);
    if (co.getTime() < end.getTime() - 60 * 1000) {
      status = ATTENDANCE_STATUSES.EARLY_LEAVE;
    }
  }
  const scheduledHours = shift ? (parseShiftTimeOnDate(ci, shift.end_time).getTime() - parseShiftTimeOnDate(ci, shift.start_time).getTime()) / 3600000 - breakH : 8;
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
      throw new AppError('Already checked in today.', 400, 'ALREADY_IN');
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

    const shift = await this.employeeRepository.getCurrentShift(auth.employeeId);
    const checkInTime = new Date();
    const { lateMinutes, status: baseStatus } = computeLateAndStatus(checkInTime.toISOString(), shift);
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

    const shift = await this.employeeRepository.getCurrentShift(auth.employeeId);
    const nowIso = new Date().toISOString();
    const checkInIso = new Date(open.check_in).toISOString();
    const { workHours, overtimeHours, status } = computeWorkAndCheckoutStatus(
      checkInIso,
      nowIso,
      shift,
      open.attendance_status
    );

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

  async exportRows() {
    return this.attendanceRepository.listAllWithJoins();
  }

  async professionalReportRows(dateFrom, dateTo) {
    return this.attendanceRepository.professionalReport(dateFrom, dateTo);
  }
}

module.exports = { AttendanceService };
