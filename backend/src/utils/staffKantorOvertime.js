const config = require('../config/env');
const { ATTENDANCE_STATUS_BUFFER_MINUTES } = require('../constants/attendance');

/** Overtime counts from 16:00 when checkout is after 16:30 (office calendar day, Asia/Jakarta). */
const OVERTIME_START_TIME = '16:00:00';
const OVERTIME_THRESHOLD_TIME = '16:30:00';
const STAFF_KANTOR_END_TIME = '16:00:00';
const EARLY_LEAVE_BUFFER_MS = ATTENDANCE_STATUS_BUFFER_MINUTES * 60 * 1000;

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
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const first = utcGuess - offsetAtInstantMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offsetAtInstantMs(new Date(first), timeZone));
}

function parseTimeOnCalendarDay(baseDate, timeStr) {
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

/**
 * Staff Kantor: checkout after 16:30 → lembur minutes from 16:00 to checkout.
 * @param {string|Date} checkOutIso
 * @returns {number} whole minutes
 */
function computeStaffKantorOvertimeMinutes(checkOutIso) {
  if (!checkOutIso) return 0;
  const co = new Date(checkOutIso);
  if (Number.isNaN(co.getTime())) return 0;
  const threshold = parseTimeOnCalendarDay(co, OVERTIME_THRESHOLD_TIME);
  if (co.getTime() <= threshold.getTime()) return 0;
  const overtimeStart = parseTimeOnCalendarDay(co, OVERTIME_START_TIME);
  return Math.max(0, Math.floor((co.getTime() - overtimeStart.getTime()) / 60000));
}

/**
 * Minutes before shift end (0 within grace buffer). Same buffer as EARLY_LEAVE status.
 * @param {string|Date} checkOutIso
 * @param {string} [endTime] default Staff Kantor 16:00
 */
function computeEarlyLeaveMinutes(checkOutIso, endTime = STAFF_KANTOR_END_TIME) {
  if (!checkOutIso || !endTime) return 0;
  const co = new Date(checkOutIso);
  if (Number.isNaN(co.getTime())) return 0;
  const end = parseTimeOnCalendarDay(co, endTime);
  const diffMs = end.getTime() - co.getTime();
  if (diffMs <= EARLY_LEAVE_BUFFER_MS) return 0;
  return Math.max(0, Math.floor(diffMs / 60000));
}

/** gaji / required_days / 8 / 60 (per minute). */
function staffKantorPerMinuteRate(gaji, requiredWorkDays) {
  const days = Math.max(1, Math.floor(Number(requiredWorkDays) || 0));
  const basic = Number(gaji) || 0;
  if (!basic) return 0;
  return basic / days / 8 / 60;
}

/** Pay or deduction from minute count (lembur, potongan terlambat). */
function computeStaffKantorPerMinuteAmount({ gaji, requiredWorkDays, minutes }) {
  const rate = staffKantorPerMinuteRate(gaji, requiredWorkDays);
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  if (!m || !rate) return 0;
  return Math.round(rate * m);
}

/** Lembur pay = gaji / required_days / 8 / 60 × overtime_minutes */
function computeLemburPay({ gaji, requiredWorkDays, overtimeMinutes }) {
  return computeStaffKantorPerMinuteAmount({
    gaji,
    requiredWorkDays,
    minutes: overtimeMinutes,
  });
}

/** Potongan datang terlambat or potongan pulang awal = gaji / required_days / 8 / 60 × minutes */
function computeLateDeductionPay({ gaji, requiredWorkDays, lateMinutes }) {
  return computeStaffKantorPerMinuteAmount({
    gaji,
    requiredWorkDays,
    minutes: lateMinutes,
  });
}

module.exports = {
  OVERTIME_START_TIME,
  OVERTIME_THRESHOLD_TIME,
  STAFF_KANTOR_END_TIME,
  computeStaffKantorOvertimeMinutes,
  computeEarlyLeaveMinutes,
  computeStaffKantorPerMinuteAmount,
  computeLemburPay,
  computeLateDeductionPay,
};
