const assert = require('assert');
const { computeTotals } = require('../src/utils/payrollTotals');

const settings = { transport_amount: 250_000, diligence_amount: 100_000 };

const monthlyNet = computeTotals(
  {
    basic_salary: 4_000_000,
    monthly_basic_gross: 5_000_000,
    absence_deduction: 1_000_000,
    transport_eligible: true,
    transport_allowance_amount: 250_000,
    diligence_eligible: false,
    tunjangan_masa_kerja: 0,
    tunjangan_pph_21: 100_000,
    overtime_pay: 0,
    insentif: 0,
    bonus_omset: 0,
    loan_deduction: 200_000,
    late_deduction: 30_000,
    early_leave_deduction: 20_000,
    pph_21: 0,
    other_deductions: 50_000,
    bpjs_tk: 0,
    bpjs_kes: 0,
  },
  {},
  settings,
  'employee'
);

// 5_000_000 + 250_000 + 100_000 − 1_000_000 − 200_000 − 30_000 − 20_000 − 50_000 = 4_050_000
assert.strictEqual(monthlyNet.final_salary, 4_050_000, 'net includes tunjangan PPh 21 and separate early-leave deduction');
assert.strictEqual(monthlyNet.other_deductions, 50_000, 'other deductions stay custom line items');
assert.strictEqual(monthlyNet.early_leave_deduction, 20_000);
assert.strictEqual(monthlyNet.tunjangan_pph_21, 100_000);

console.log('payrollTotals.test.js: ok');
