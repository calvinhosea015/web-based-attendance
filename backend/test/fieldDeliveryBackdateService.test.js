const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  FieldDeliveryBackdateService,
  parseYmd,
  daysBetweenYmd,
  MAX_BACKDATE_DAYS,
} = require('../src/services/fieldDeliveryBackdateService');
const { attendanceCalendarDayStr } = require('../src/utils/calendarDay');
const { AppError } = require('../src/utils/errors');

function shiftYmd(ymd, deltaDays) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

describe('FieldDeliveryBackdateService helpers', () => {
  it('parses valid YYYY-MM-DD and rejects bad calendar dates', () => {
    assert.equal(parseYmd('2026-07-01'), '2026-07-01');
    assert.equal(parseYmd('2026-02-31'), null);
    assert.equal(parseYmd('07-01-2026'), null);
  });

  it('computes day lag', () => {
    assert.equal(daysBetweenYmd('2026-07-01', '2026-07-08'), 7);
    assert.equal(MAX_BACKDATE_DAYS, 7);
  });
});

describe('FieldDeliveryBackdateService submit', () => {
  it('rejects non-field officers', async () => {
    const service = new FieldDeliveryBackdateService({}, {});
    await assert.rejects(
      () => service.submit({ role: 'employee', employeeId: 1 }, 1, {}),
      (err) => err instanceof AppError && err.statusCode === 403
    );
  });

  it('creates a request for a past date within the lookback window', async () => {
    let created = null;
    const today = attendanceCalendarDayStr();
    const ymd = shiftYmd(today, -2);

    const service = new FieldDeliveryBackdateService(
      {
        hasPendingForDelivery: async () => false,
        create: async (row) => {
          created = row;
          return { id: 9, ...row };
        },
      },
      {
        findById: async () => ({
          id: 3,
          employee_id: 1,
          valid_on: today,
        }),
      }
    );

    const row = await service.submit(
      { role: 'field_officer', employeeId: 1 },
      3,
      { requested_valid_on: ymd, reason: 'Late paperwork' }
    );

    assert.equal(created.deliveryId, 3);
    assert.equal(created.requestedValidOn, ymd);
    assert.equal(created.reason, 'Late paperwork');
    assert.equal(row.id, 9);
  });

  it('rejects future or today dates', async () => {
    const today = attendanceCalendarDayStr();
    const service = new FieldDeliveryBackdateService(
      { hasPendingForDelivery: async () => false },
      {
        findById: async () => ({ id: 3, employee_id: 1, valid_on: today }),
      }
    );

    await assert.rejects(
      () =>
        service.submit(
          { role: 'field_officer', employeeId: 1 },
          3,
          { requested_valid_on: today, reason: 'x' }
        ),
      (err) => err instanceof AppError && err.code === 'DATE_NOT_PAST'
    );
  });
});

describe('FieldDeliveryBackdateService decide', () => {
  it('moves valid_on on approve when check-in exists', async () => {
    let updated = null;
    const today = attendanceCalendarDayStr();
    const recentYmd = shiftYmd(today, -2);
    const service = new FieldDeliveryBackdateService(
      {
        findById: async () => ({
          id: 5,
          employee_id: 1,
          delivery_id: 3,
          requested_valid_on: recentYmd,
          approval_status: 'pending',
        }),
        setDecision: async (id, { status }) => ({
          id,
          approval_status: status,
        }),
      },
      {
        updateValidOn: async (id, validOn, attendanceId) => {
          updated = { id, validOn, attendanceId };
          return { id, valid_on: validOn, attendance_id: attendanceId };
        },
      },
      {
        countTodaySegments: async () => 1,
        findOpenToday: async () => null,
        findAnyToday: async () => ({ id: 44 }),
      },
      {
        findForEmployeeOnDate: async () => null,
        createForEmployeeOnDate: async () => ({}),
        linkAttendance: async () => {},
      }
    );

    const row = await service.decide(5, { userId: 99 }, { status: 'approved' });
    assert.equal(updated.validOn, recentYmd);
    assert.equal(updated.attendanceId, 44);
    assert.equal(row.approval_status, 'approved');
  });

  it('refuses approve when there is no check-in on the requested date', async () => {
    const today = attendanceCalendarDayStr();
    const recentYmd = shiftYmd(today, -1);
    const service = new FieldDeliveryBackdateService(
      {
        findById: async () => ({
          id: 5,
          employee_id: 1,
          delivery_id: 3,
          requested_valid_on: recentYmd,
          approval_status: 'pending',
        }),
      },
      { updateValidOn: async () => ({}) },
      { countTodaySegments: async () => 0 }
    );

    await assert.rejects(
      () => service.decide(5, { userId: 1 }, { status: 'approved' }),
      (err) => err instanceof AppError && err.code === 'CHECK_IN_REQUIRED'
    );
  });
});
