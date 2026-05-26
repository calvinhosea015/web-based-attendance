const fs = require('fs');
const path = require('path');
const Holidays = require('date-holidays');
const config = require('../config/env');

/** National days off used for Staff Kantor payroll (Mon–Sat required days). */
const PAYROLL_HOLIDAY_TYPES = new Set(['public', 'bank']);

let holidaysClient;
let extraDatesCache;

function getHolidaysClient() {
  if (!holidaysClient) {
    holidaysClient = new Holidays('ID');
    holidaysClient.setTimezone(config.attendanceCalendarTz || 'Asia/Jakarta');
  }
  return holidaysClient;
}

function loadExtraHolidayDates() {
  if (extraDatesCache) return extraDatesCache;
  const set = new Set();
  const envList = (process.env.ID_PAYROLL_EXTRA_HOLIDAYS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
  for (const d of envList) set.add(d);

  const filePath = path.join(__dirname, '../../data/indonesia-payroll-holidays.json');
  try {
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const flat = [...(raw.dates || [])];
      if (raw.byYear && typeof raw.byYear === 'object') {
        for (const dates of Object.values(raw.byYear)) {
          if (Array.isArray(dates)) flat.push(...dates);
        }
      }
      for (const d of flat) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(d))) set.add(String(d));
      }
    }
  } catch {
    /* ignore malformed file */
  }
  extraDatesCache = set;
  return extraDatesCache;
}

function parseYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function toYmd(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addCalendarDays(ymd, days) {
  const p = parseYmd(ymd);
  if (!p) return null;
  const dt = new Date(p.y, p.m - 1, p.d);
  dt.setDate(dt.getDate() + days);
  return toYmd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

function dayOfWeekMon0(ymd) {
  const p = parseYmd(ymd);
  if (!p) return -1;
  const dow = new Date(p.y, p.m - 1, p.d).getDay();
  return dow === 0 ? 6 : dow - 1;
}

function isWeekendSunday(ymd) {
  const p = parseYmd(ymd);
  if (!p) return false;
  return new Date(p.y, p.m - 1, p.d).getDay() === 0;
}

function isIndonesiaPayrollHoliday(ymd) {
  if (!ymd || isWeekendSunday(ymd)) return false;
  if (loadExtraHolidayDates().has(ymd)) return true;

  const p = parseYmd(ymd);
  if (!p) return false;

  const hd = getHolidaysClient();
  const atNoon = new Date(p.y, p.m - 1, p.d, 12, 0, 0);
  const result = hd.isHoliday(atNoon);
  if (!result) return false;

  const list = Array.isArray(result) ? result : [result];
  return list.some((h) => PAYROLL_HOLIDAY_TYPES.has(h.type));
}

function holidayInfoForDate(ymd) {
  if (!isIndonesiaPayrollHoliday(ymd)) return null;
  if (loadExtraHolidayDates().has(ymd)) {
    return { date: ymd, name: 'Libur nasional (tambahan)', type: 'public' };
  }
  const p = parseYmd(ymd);
  if (!p) return null;
  const hd = getHolidaysClient();
  const result = hd.isHoliday(new Date(p.y, p.m - 1, p.d, 12, 0, 0));
  const list = (Array.isArray(result) ? result : result ? [result] : []).filter((h) =>
    PAYROLL_HOLIDAY_TYPES.has(h.type)
  );
  const first = list[0];
  if (!first) return { date: ymd, name: 'Libur nasional', type: 'public' };
  return {
    date: ymd,
    name: first.name || 'Libur nasional',
    type: first.type,
  };
}

function listIndonesiaHolidaysBetween(startYmd, endYmd) {
  const out = [];
  if (!parseYmd(startYmd) || !parseYmd(endYmd)) return out;
  let cur = startYmd;
  let guard = 0;
  while (cur && cur <= endYmd && guard < 400) {
    if (!isWeekendSunday(cur)) {
      const info = holidayInfoForDate(cur);
      if (info) out.push(info);
    }
    cur = addCalendarDays(cur, 1);
    guard += 1;
  }
  return out;
}

module.exports = {
  isIndonesiaPayrollHoliday,
  listIndonesiaHolidaysBetween,
  dayOfWeekMon0,
  parseYmd,
  toYmd,
};
