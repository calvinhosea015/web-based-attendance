const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ROLES,
  isValidRole,
  usesDailyWagePayroll,
  usesOncePerDayInOut,
  isFieldOfficer,
  isGeneralAffairs,
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

  it('shares once-per-day attendance with field officer', () => {
    assert.equal(usesOncePerDayInOut('general_affairs'), true);
    assert.equal(isGeneralAffairs('general_affairs'), true);
    assert.equal(isFieldOfficer('general_affairs'), false);
  });
});
