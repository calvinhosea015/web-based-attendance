const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { FieldCheckoutCodeService } = require('../src/services/fieldCheckoutCodeService');
const { AppError } = require('../src/utils/errors');

describe('FieldCheckoutCodeService submit', () => {
  it('rejects delivery data when employee has not checked in today', async () => {
    const attendanceRepository = {
      countTodaySegments: async () => 0,
    };
    const service = new FieldCheckoutCodeService(
      { createEntry: async () => ({}) },
      {},
      null,
      null,
      attendanceRepository
    );

    await assert.rejects(
      () =>
        service.submit(
          { role: 'field_officer', employeeId: 1 },
          { code: '1*12345*A*B*C*D*E*100*90' }
        ),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'CHECK_IN_REQUIRED');
        return true;
      }
    );
  });
});
