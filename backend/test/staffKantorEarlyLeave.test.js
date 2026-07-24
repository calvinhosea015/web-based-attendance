const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeEarlyLeaveMinutes,
  computeLateDeductionPay,
  STAFF_KANTOR_END_TIME,
} = require('../src/utils/staffKantorOvertime');

/** Build an ISO instant on a fixed Jakarta calendar day at HH:MM:SS. */
function jakartaIso(hour, minute, second = 0) {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  const ss = String(second).padStart(2, '0');
  return new Date(`2026-03-10T${hh}:${mm}:${ss}+07:00`).toISOString();
}

describe('Staff Kantor early leave minutes', () => {
  it('returns 0 within the 5-minute grace before 16:00', () => {
    assert.equal(computeEarlyLeaveMinutes(jakartaIso(15, 56), STAFF_KANTOR_END_TIME), 0);
  });

  it('counts minutes before shift end when leaving early', () => {
    assert.equal(computeEarlyLeaveMinutes(jakartaIso(15, 30), STAFF_KANTOR_END_TIME), 30);
  });

  it('deducts early minutes at the same per-minute rate as late', () => {
    const earlyPay = computeLateDeductionPay({
      gaji: 4_800_000,
      requiredWorkDays: 25,
      lateMinutes: 30,
    });
    // 4_800_000 / 25 / 8 / 60 × 30 = 12_000
    assert.equal(earlyPay, 12_000);
  });

  it('keeps late and early minute amounts separate at the same rate', () => {
    const latePay = computeLateDeductionPay({
      gaji: 4_800_000,
      requiredWorkDays: 25,
      lateMinutes: 15,
    });
    const earlyPay = computeLateDeductionPay({
      gaji: 4_800_000,
      requiredWorkDays: 25,
      lateMinutes: 30,
    });
    assert.equal(latePay, 6_000);
    assert.equal(earlyPay, 12_000);
    assert.equal(latePay + earlyPay, 18_000);
  });
});
