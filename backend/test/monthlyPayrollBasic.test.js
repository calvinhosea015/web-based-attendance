const assert = require('assert');
const { computeMonthlyStaffPayroll } = require('../src/utils/payrollMonthlyBasic');

const partial = computeMonthlyStaffPayroll({
  monthlyBasic: 3_000_000,
  expectedDays: 25,
  daysAttended: 20,
});
assert.strictEqual(partial.basic_salary, 2_400_000, 'cleaning: salary × attended ÷ required');
assert.strictEqual(partial.absence_deduction, 600_000);

const full = computeMonthlyStaffPayroll({
  monthlyBasic: 3_000_000,
  expectedDays: 25,
  daysAttended: 25,
});
assert.strictEqual(full.basic_salary, 3_000_000, 'full month when all required days attended');

console.log('monthlyPayrollBasic.test.js: ok');
