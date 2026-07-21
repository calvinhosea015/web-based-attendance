function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Monthly salary × min(attended, required) ÷ required (Cleaning, Staff Kantor, Accounting). */
function computeMonthlyStaffPayroll({ monthlyBasic, expectedDays, daysAttended }) {
  const basic = Math.max(0, num(monthlyBasic));
  const expected = Math.max(0, Math.floor(num(expectedDays)));
  const attended = Math.max(0, Math.floor(num(daysAttended)));
  const absent = Math.max(0, expected - attended);
  const attendedForPay = expected > 0 ? Math.min(attended, expected) : 0;
  const netBasic =
    expected > 0 ? Math.max(0, Math.round((basic * attendedForPay) / expected)) : 0;
  const absenceDeduction = Math.max(0, Math.round(basic) - netBasic);
  return {
    monthly_basic_gross: basic,
    expected_work_days: expected,
    days_attended: attended,
    days_absent: absent,
    absence_deduction: absenceDeduction,
    basic_salary: netBasic,
    upah_harian: 0,
  };
}

module.exports = { computeMonthlyStaffPayroll, num };
