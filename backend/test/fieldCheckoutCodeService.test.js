const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { FieldCheckoutCodeService } = require('../src/services/fieldCheckoutCodeService');
const { validateFieldCheckoutCode } = require('../src/utils/fieldCheckoutPayload');
const { AppError } = require('../src/utils/errors');

describe('validateFieldCheckoutCode selisih', () => {
  it('accepts berat bersih greater than kotor (selisih is the absolute difference)', () => {
    const parsed = validateFieldCheckoutCode('2*02020*1999*06326*L 8393 UP*0*SB*0*2510');
    assert.equal(parsed.kotor, 0);
    assert.equal(parsed.berat_bersih, 2510);
    assert.equal(parsed.selisih, 2510);
  });

  it('keeps the normal case unchanged (kotor >= berat bersih)', () => {
    const parsed = validateFieldCheckoutCode('1*12345*1*1*NOPOL*0*ITEM*100*90');
    assert.equal(parsed.selisih, 10);
  });
});

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

describe('FieldCheckoutCodeService assertReadyForCheckout', () => {
  it('lets a field officer check out with no delivery data (does not throw)', async () => {
    let createEntryCalls = 0;
    const service = new FieldCheckoutCodeService({
      countForEmployeeOnDate: async () => 0,
      createEntry: async () => {
        createEntryCalls += 1;
        return {};
      },
    });

    await service.assertReadyForCheckout({ role: 'field_officer', employeeId: 1 }, undefined);
    assert.equal(createEntryCalls, 0);
  });
});
