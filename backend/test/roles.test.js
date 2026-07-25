const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ROLES,
  GA_CLOCK_MODES,
  isValidRole,
  usesDailyWagePayroll,
  usesOncePerDayInOut,
  usesCheckInOnlyClock,
  usesSimpleDailyCheckout,
  isFieldOfficer,
  isGeneralAffairs,
  normalizeGaClockMode,
} = require('../src/constants/roles');

describe('general_affairs role', () => {
  it('is a valid stored role', () => {
    assert.equal(isValidRole(ROLES.GENERAL_AFFAIRS), true);
  });

  it('uses daily wage payroll like field officer', () => {
    assert.equal(usesDailyWagePayroll('general_affairs'), true);
    assert.equal(usesDailyWagePayroll('field_officer'), true);
    assert.equal(usesDailyWagePayroll('umum'), false);
  });

  it('defaults to once-per-day in/out (two clocks)', () => {
    assert.equal(usesOncePerDayInOut('general_affairs'), true);
    assert.equal(usesOncePerDayInOut('general_affairs', GA_CLOCK_MODES.IN_OUT), true);
    assert.equal(usesCheckInOnlyClock('general_affairs'), false);
    assert.equal(usesSimpleDailyCheckout('general_affairs'), true);
    assert.equal(isGeneralAffairs('general_affairs'), true);
    assert.equal(isFieldOfficer('general_affairs'), false);
  });

  it('supports per-employee check-in-only mode (umum-style auto-checkout)', () => {
    assert.equal(
      usesCheckInOnlyClock('general_affairs', GA_CLOCK_MODES.CHECK_IN_ONLY),
      true
    );
    assert.equal(usesOncePerDayInOut('general_affairs', GA_CLOCK_MODES.CHECK_IN_ONLY), false);
    assert.equal(
      usesSimpleDailyCheckout('general_affairs', GA_CLOCK_MODES.CHECK_IN_ONLY),
      false
    );
    assert.equal(usesCheckInOnlyClock('umum'), true);
    assert.equal(normalizeGaClockMode('check_in_only'), 'check_in_only');
    assert.equal(normalizeGaClockMode(null), 'in_out');
  });
});
