import assert from 'node:assert/strict';
import { previewPayrollNetSalary } from './payrollTotals.js';

const net = previewPayrollNetSalary(
  {
    monthly_basic_gross: 5_000_000,
    basic_salary: 4_000_000,
    absence_deduction: 1_000_000,
    transport_eligible: true,
    transport_allowance_amount: 250_000,
    diligence_eligible: false,
    tunjangan_masa_kerja: 0,
    overtime_pay: 0,
    insentif: 0,
    bonus_omset: 0,
    loan_deduction: 200_000,
    late_deduction: 0,
    pph_21: 0,
    other_deductions: 50_000,
    bpjs_tk: 0,
    bpjs_kes: 0,
  },
  { isMonthly: true, isManual: false }
);

assert.strictEqual(
  net,
  4_000_000,
  'net = monthly gross + allowances − absence, loans, custom other, tax, BPJS'
);

console.log('payrollTotals.test.js: ok');
