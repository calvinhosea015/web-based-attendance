const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePayrollPeriodKey,
  payrollCycleBounds,
  payrollCycleLabel,
  countWorkingDaysMonSatInCycle,
  currentPayrollPeriodKey,
  isPayrollPeriodVisibleToEmployee,
} = require('../src/utils/payrollPeriod');

describe('payrollPeriod', () => {
  it('parses valid YYYY-MM keys', () => {
    assert.deepEqual(parsePayrollPeriodKey('2026-05'), { year: 2026, month: 5 });
    assert.equal(parsePayrollPeriodKey('2026-13'), null);
    assert.equal(parsePayrollPeriodKey('bad'), null);
  });

  it('computes 25th–24th cycle bounds', () => {
    const bounds = payrollCycleBounds('2026-05');
    assert.equal(bounds.period_start, '2026-04-25');
    assert.equal(bounds.period_end, '2026-05-24');
    assert.equal(bounds.payroll_period, '2026-05');
  });

  it('handles January rollover', () => {
    const bounds = payrollCycleBounds('2026-01');
    assert.equal(bounds.period_start, '2025-12-25');
    assert.equal(bounds.period_end, '2026-01-24');
  });

  it('builds Indonesian cycle label', () => {
    const label = payrollCycleLabel('2026-05');
    assert.match(label, /25 April 2026/);
    assert.match(label, /24 Mei 2026/);
  });

  it('counts Mon–Sat workdays in a cycle', () => {
    const days = countWorkingDaysMonSatInCycle('2026-05');
    assert.ok(days >= 20 && days <= 31);
  });

  it('switches current period key on the 25th', () => {
    assert.equal(currentPayrollPeriodKey('2026-08-24'), '2026-08');
    assert.equal(currentPayrollPeriodKey('2026-08-25'), '2026-09');
    assert.equal(currentPayrollPeriodKey('2025-12-25'), '2026-01');
  });

  it('hides employee payslips until on/after the 25th of the period month', () => {
    assert.equal(isPayrollPeriodVisibleToEmployee('2026-08', '2026-08-24'), false);
    assert.equal(isPayrollPeriodVisibleToEmployee('2026-08', '2026-08-25'), true);
    assert.equal(isPayrollPeriodVisibleToEmployee('2026-08', '2026-09-01'), true);
    assert.equal(isPayrollPeriodVisibleToEmployee('2026-07', '2026-08-10'), true);
    assert.equal(isPayrollPeriodVisibleToEmployee('2026-01', '2026-01-24'), false);
    assert.equal(isPayrollPeriodVisibleToEmployee('2026-01', '2026-01-25'), true);
    assert.equal(isPayrollPeriodVisibleToEmployee('bad', '2026-08-25'), false);
  });
});
