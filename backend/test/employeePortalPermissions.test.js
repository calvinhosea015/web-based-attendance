const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EmployeePortalService } = require('../src/services/employeePortalService');
const { AppError } = require('../src/utils/errors');

describe('delivery recap permissions', () => {
  const service = new EmployeePortalService();
  const accountingAuth = { role: 'accounting', employeeId: 1 };

  it('does not let accounting list delivery recaps', async () => {
    await assert.rejects(
      () => service.listFieldOfficerDeliveries(accountingAuth),
      (err) => err instanceof AppError && err.statusCode === 403 && err.code === 'FORBIDDEN'
    );
  });

  it('does not let accounting read the unchecked-recap count', async () => {
    await assert.rejects(
      () => service.countUncheckedDeliveryRecaps(accountingAuth),
      (err) => err instanceof AppError && err.statusCode === 403 && err.code === 'FORBIDDEN'
    );
  });
});
