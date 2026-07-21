const { receivesMonthlyAbsenceDeduction } = require('./payrollRoleRules');

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function resolveAllowanceAmounts(fields, employee, settings) {
  const transportAmount =
    fields.transport_allowance_amount != null
      ? num(fields.transport_allowance_amount)
      : num(employee?.transport_allowance_amount ?? settings.transport_amount);
  const diligenceAmount =
    fields.diligence_allowance_amount != null
      ? num(fields.diligence_allowance_amount)
      : num(employee?.diligence_allowance_amount ?? settings.diligence_amount);
  return { transportAmount, diligenceAmount };
}

function computeTotals(fields, employee, settings, role = null) {
  const { transportAmount, diligenceAmount } = resolveAllowanceAmounts(fields, employee, settings);
  const transportAllowance = fields.transport_eligible ? transportAmount : 0;
  const diligenceBonus = fields.diligence_eligible ? diligenceAmount : 0;
  const tunjangan = num(fields.tunjangan_masa_kerja);
  const overtime = num(fields.overtime_pay);
  const insentif = num(fields.insentif);
  const bonusOmset = num(fields.bonus_omset);
  const loanDeduction = num(fields.loan_deduction);
  const lateDeduction = num(fields.late_deduction);
  const pph21 = num(fields.pph_21);
  const otherDeductions = num(fields.other_deductions);
  const bpjsTk = num(fields.bpjs_tk);
  const bpjsKes = num(fields.bpjs_kes);
  const absenceDeduction = num(fields.absence_deduction);
  const monthlyGross = num(fields.monthly_basic_gross);
  const isMonthly = role && receivesMonthlyAbsenceDeduction(role);

  let earningsBase = num(fields.basic_salary);
  let basicSalary = earningsBase;
  if (isMonthly) {
    const gross = monthlyGross > 0 ? monthlyGross : earningsBase + absenceDeduction;
    earningsBase = gross;
    basicSalary = Math.max(0, gross - absenceDeduction);
  }

  const deductions =
    absenceDeduction +
    loanDeduction +
    lateDeduction +
    pph21 +
    otherDeductions +
    bpjsTk +
    bpjsKes;
  const allowances =
    tunjangan + transportAllowance + overtime + insentif + diligenceBonus + bonusOmset;
  const finalSalary = earningsBase + allowances - deductions;
  return {
    transport_allowance: transportAllowance,
    diligence_bonus: diligenceBonus,
    loan_deduction: loanDeduction,
    late_deduction: lateDeduction,
    pph_21: pph21,
    other_deductions: otherDeductions,
    bpjs_tk: bpjsTk,
    bpjs_kes: bpjsKes,
    absence_deduction: absenceDeduction,
    deductions,
    allowances,
    final_salary: finalSalary,
    basic_salary: basicSalary,
    transport_allowance_amount: transportAmount,
    diligence_allowance_amount: diligenceAmount,
  };
}

module.exports = {
  computeTotals,
  resolveAllowanceAmounts,
  num,
};
