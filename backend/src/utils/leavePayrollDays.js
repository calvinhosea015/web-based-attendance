const { isIndonesiaPayrollHoliday } = require('./indonesiaHolidays');

function parseYmd(s) {
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isPayrollWorkday(ymd, monSatOnly) {
  const d = parseYmd(ymd);
  if (!d) return false;
  if (monSatOnly && d.getDay() === 0) return false;
  if (isIndonesiaPayrollHoliday(ymd)) return false;
  return true;
}

/** Distinct calendar dates covered by approved paid leave overlapping the pay period. */
function paidLeaveDatesInPeriod(paidLeaveRanges, periodStart, periodEnd, monSatOnly) {
  const dates = new Set();
  const periodStartD = parseYmd(periodStart);
  const periodEndD = parseYmd(periodEnd);
  if (!periodStartD || !periodEndD) return dates;

  for (const row of paidLeaveRanges) {
    const leaveStart = parseYmd(row.start_date);
    const leaveEnd = parseYmd(row.end_date);
    if (!leaveStart || !leaveEnd) continue;
    const start = leaveStart > periodStartD ? leaveStart : periodStartD;
    const end = leaveEnd < periodEndD ? leaveEnd : periodEndD;
    if (end < start) continue;
    const cur = new Date(start);
    while (cur <= end) {
      const ymd = toYmd(cur);
      if (isPayrollWorkday(ymd, monSatOnly)) dates.add(ymd);
      cur.setDate(cur.getDate() + 1);
    }
  }
  return dates;
}

/**
 * Staff Kantor payroll: union of attendance check-in days and approved paid leave workdays.
 */
function countEffectiveDaysAttended({
  periodStart,
  periodEnd,
  attendanceDates,
  paidLeaveRanges,
  monSatOnly,
}) {
  const dates = new Set();
  for (const ymd of attendanceDates) {
    if (ymd >= periodStart && ymd <= periodEnd && isPayrollWorkday(ymd, monSatOnly)) {
      dates.add(ymd);
    }
  }
  const paid = paidLeaveDatesInPeriod(paidLeaveRanges, periodStart, periodEnd, monSatOnly);
  for (const ymd of paid) dates.add(ymd);
  return dates.size;
}

module.exports = {
  countEffectiveDaysAttended,
  isPayrollWorkday,
  paidLeaveDatesInPeriod,
};
