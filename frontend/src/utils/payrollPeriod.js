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
  const fmt = (m, y) => `${ID_MONTHS[m - 1] || ''} ${y}`;
  return `25 ${fmt(bounds.startMonth, bounds.startYear)} – 24 ${fmt(bounds.endMonth, bounds.endYear)}`;
}

export function periodLabelCalendar(period) {
  const parsed = parsePayrollPeriodKey(period);
  if (!parsed) return period;
  return `${ID_MONTHS[parsed.month - 1]} ${parsed.year}`;
}

/** Active payroll period for a given date (cycle switches on the 25th). */
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
