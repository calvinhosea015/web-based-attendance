/** Mirrors backend/src/utils/payrollTotals.js for admin edit preview. */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function previewPayrollNetSalary(fields, { isMonthly, isManual } = {}) {
  const transportAllowance = fields.transport_eligible ? num(fields.transport_allowance_amount) : 0;
  const diligenceBonus = fields.diligence_eligible ? num(fields.diligence_allowance_amount) : 0;
  const absenceDeduction = num(fields.absence_deduction);
  const monthlyGross = num(fields.monthly_basic_gross);

  let earningsBase;
  if (isManual) {
    earningsBase = num(fields.basic_salary);
  } else if (isMonthly) {
    const baseAfterAbsence = num(fields.basic_salary);
    const gross =
      monthlyGross > 0 ? monthlyGross : baseAfterAbsence + absenceDeduction;
    earningsBase = gross;
  } else {
    const days = Math.max(0, Math.floor(num(fields.days_attended)));
    earningsBase = days * num(fields.upah_harian);
  }

  const deductions =
    absenceDeduction +
    num(fields.loan_deduction) +
    num(fields.late_deduction) +
    num(fields.pph_21) +
    num(fields.other_deductions) +
    num(fields.bpjs_tk) +
    num(fields.bpjs_kes);
  const allowances =
    num(fields.tunjangan_masa_kerja) +
    transportAllowance +
    num(fields.overtime_pay) +
    num(fields.insentif) +
    diligenceBonus +
    num(fields.bonus_omset);

  return Math.max(0, Math.round(earningsBase + allowances - deductions));
}
