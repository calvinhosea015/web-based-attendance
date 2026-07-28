const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assertEmployeeLoginAllowed } = require('../src/services/authService');
const { AppError } = require('../src/utils/errors');

describe('assertEmployeeLoginAllowed', () => {
  it('allows admin without employee link', () => {
    assert.doesNotThrow(() => assertEmployeeLoginAllowed({ employee_id: null }));
  });

  it('allows active employees', () => {
    assert.doesNotThrow(() =>
      assertEmployeeLoginAllowed({ employee_id: 1, employee_status: 'active' })
    );
  });

  it('blocks inactive employees', () => {
    assert.throws(
      () => assertEmployeeLoginAllowed({ employee_id: 1, employee_status: 'inactive' }),
      (err) => err instanceof AppError && err.code === 'ACCOUNT_INACTIVE'
    );
  });
});
