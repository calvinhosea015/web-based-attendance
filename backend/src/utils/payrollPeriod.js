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

function parsePayrollPeriodKey(period) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function payrollCycleBounds(period) {
  const parsed = parsePayrollPeriodKey(period);
  if (!parsed) return null;
  const { year, month } = parsed;
  let startYear = year;
  let startMonth = month - 1;
  if (startMonth < 1) {
    startMonth = 12;
    startYear -= 1;
  }
  const periodStart = `${startYear}-${String(startMonth).padStart(2, '0')}-25`;
  const periodEnd = `${year}-${String(month).padStart(2, '0')}-24`;
  return {
    payroll_period: `${year}-${String(month).padStart(2, '0')}`,
    period_start: periodStart,
    period_end: periodEnd,
    startYear,
    startMonth,
    endYear: year,
    endMonth: month,
  };
}

function payrollCycleLabel(period, { upper = false } = {}) {
  const bounds = payrollCycleBounds(period);
  if (!bounds) return String(period || '');
  const fmt = (m, y) => {
    const name = ID_MONTHS[m - 1] || '';
    return upper ? name.toUpperCase() : name;
  };
  return `25 ${fmt(bounds.startMonth, bounds.startYear)} ${bounds.startYear} - 24 ${fmt(bounds.endMonth, bounds.endYear)} ${bounds.endYear}`;
}

function payrollCycleLabelShort(period) {
  const bounds = payrollCycleBounds(period);
  if (!bounds) return String(period || '');
  const sm = String(bounds.startMonth).padStart(2, '0');
  const em = String(bounds.endMonth).padStart(2, '0');
  return `25/${sm}/${String(bounds.startYear).slice(-2)} - 24/${em}/${String(bounds.endYear).slice(-2)}`;
}

function periodLabelCalendar(period) {
  const parsed = parsePayrollPeriodKey(period);
  if (!parsed) return period;
  return `${ID_MONTHS[parsed.month - 1]} ${parsed.year}`;
}

function countWorkingDaysMonSatInCycle(period) {
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

function cycleEndDate(period) {
  const bounds = payrollCycleBounds(period);
  if (!bounds) return null;
  return new Date(bounds.endYear, bounds.endMonth - 1, 24);
}

module.exports = {
  ID_MONTHS,
  parsePayrollPeriodKey,
  payrollCycleBounds,
  payrollCycleLabel,
  payrollCycleLabelShort,
  periodLabelCalendar,
  countWorkingDaysMonSatInCycle,
  cycleEndDate,
};
