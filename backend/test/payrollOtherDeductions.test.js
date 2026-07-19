const assert = require('assert');
const {
  resolveOtherDeductionsAmount,
  resolveOtherDeductionsFromPayload,
} = require('../src/utils/payrollOtherDeductions');

assert.strictEqual(
  resolveOtherDeductionsAmount({ other_deductions: 100_000, late_deduction: 50_000 }),
  100_000
);
assert.strictEqual(
  resolveOtherDeductionsAmount({ deductions: 999_999, late_deduction: 50_000 }),
  0,
  'must not treat total deductions as potongan lain'
);
assert.strictEqual(
  resolveOtherDeductionsFromPayload(
    { deductions: 25_000 },
    { other_deductions: 10_000, late_deduction: 50_000 }
  ),
  25_000
);
assert.strictEqual(
  resolveOtherDeductionsFromPayload({}, { other_deductions: 10_000, late_deduction: 50_000 }),
  10_000
);
assert.strictEqual(resolveOtherDeductionsAmount(null), 0);

console.log('payrollOtherDeductions.test.js: ok');
