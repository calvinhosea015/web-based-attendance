const { haversineMeters } = require('../utils/geo');
const { validateClockGeoOrThrow } = require('../utils/geoTrust');
const { AppError } = require('../utils/errors');
const { ATTENDANCE_STATUSES } = require('../constants/attendance');
const config = require('../config/env');

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
  constructor(attendanceRepository, officeRepository, employeeRepository) {
    this.attendanceRepository = attendanceRepository;
    this.officeRepository = officeRepository;
    this.employeeRepository = employeeRepository;
  }

  async checkIn(auth, body, reqMeta) {
    if (auth.role !== 'employee' || !auth.employeeId) {
      throw new AppError('Only linked employees can clock in.', 403, 'NOT_EMPLOYEE');
    }
    const {
      lat,
      lng,
      office_id: officeId,
      accuracy_m: accuracyMeters,
      client_ts_ms: clientTimestampMs,
      remote_work: remoteWorkRaw,
    } = body;
    const remoteWork = remoteWorkRaw === true || remoteWorkRaw === 'true';

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

    const office = await this.officeRepository.findById(officeId);
    if (!office) throw new AppError('Selected office not found.', 400, 'OFFICE_NOT_FOUND');

    if (!isRemote) {
      const dist = haversineMeters(Number(lat), Number(lng), office.lat, office.lng);
      if (dist > config.officeRadiusMeters) {
        throw new AppError('You are not within the allowed radius of the selected office.', 400, 'RADIUS');
      }
    }

    const shift = await this.employeeRepository.getCurrentShift(auth.employeeId);
    const checkInTime = new Date();
    const { lateMinutes, status: baseStatus } = computeLateAndStatus(checkInTime.toISOString(), shift);
    const attendanceStatus = isRemote ? ATTENDANCE_STATUSES.REMOTE_WORK : baseStatus;

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
        remote_work: isRemote,
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

    const { lat, lng, accuracy_m: accuracyMeters, client_ts_ms: clientTimestampMs } = body;
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
    const { workHours, overtimeHours, status } = computeWorkAndCheckoutStatus(
      open.check_in.toISOString(),
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
