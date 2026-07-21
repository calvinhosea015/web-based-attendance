import { formatDisplayDate } from './formatDate.js';

/** Payroll month YYYY-MM = cycle 25 (prev month) through 24 (that month). */

const ID_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function parsePayrollPeriodKey(period) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function payrollCycleBounds(period) {
  const parsed = parsePayrollPeriodKey(period);
  if (!parsed) return null;
  const { year, month } = parsed;
  let startYear = year;
  let startMonth = month - 1;
  if (startMonth < 1) {
    startMonth = 12;
    startYear -= 1;
  }
  return {
    payroll_period: `${year}-${String(month).padStart(2, '0')}`,
    period_start: `${startYear}-${String(startMonth).padStart(2, '0')}-25`,
    period_end: `${year}-${String(month).padStart(2, '0')}-24`,
    startYear,
    startMonth,
    endYear: year,
    endMonth: month,
  };
}

export function payrollCycleLabel(period) {
  const bounds = payrollCycleBounds(period);
  if (!bounds) return String(period || '');
  return `${formatDisplayDate(bounds.period_start)} – ${formatDisplayDate(bounds.period_end)}`;
}

export function periodLabelCalendar(period) {
  const parsed = parsePayrollPeriodKey(period);
  if (!parsed) return period;
  return `${ID_MONTHS[parsed.month - 1]} ${parsed.year}`;
}

/** Active payroll period for a given date (cycle switches on the 25th). */
/** Mon–Sat working days in the payroll cycle (25th–24th). */
export function countWorkingDaysMonSatInCycle(period) {
  const bounds = payrollCycleBounds(period);
  if (!bounds) return 0;
  const start = new Date(bounds.startYear, bounds.startMonth - 1, 25);
  const end = new Date(bounds.endYear, bounds.endMonth - 1, 24);
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (cur.getDay() !== 0) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function previewMonthlyStaffPayroll({ monthlyBasic, expectedDays, daysAttended }) {
  const basic = Math.max(0, Number(monthlyBasic) || 0);
  const expected = Math.max(0, Math.floor(Number(expectedDays) || 0));
  const attended = Math.max(0, Math.floor(Number(daysAttended) || 0));
  const absent = Math.max(0, expected - attended);
  const attendedForPay = expected > 0 ? Math.min(attended, expected) : 0;
  const netBasic =
    expected > 0 ? Math.max(0, Math.round((basic * attendedForPay) / expected)) : 0;
  const absenceDeduction = Math.max(0, Math.round(basic) - netBasic);
  return { absent, absenceDeduction, netBasic, expected };
}

export function currentPayrollPeriodKey(date = new Date()) {
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  if (date.getDate() >= 25) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}
