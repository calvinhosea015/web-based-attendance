const assert = require('node:assert/strict');
const { AppError } = require('../src/utils/errors');
const { PayrollService } = require('../src/services/payrollService');

/** Save must not pull attendance / loans / field bonuses — only Process this month does. */
async function main() {
  let attendanceCalls = 0;
  let loanRecordCalls = 0;
  let bonusCalls = 0;

  const payrollRepository = {
    findByPeriodAndEmployee: async () => ({
      employee_id: 7,
      payroll_period: '2026-07',
      period_start: '2026-06-25',
      period_end: '2026-07-24',
      days_attended: 20,
      expected_work_days: 25,
      upah_harian: 0,
      basic_salary: 4_000_000,
      tunjangan_masa_kerja: 0,
      tunjangan_pph_21: 0,
      transport_eligible: true,
      transport_allowance: 250_000,
      overtime_pay: 100_000,
      insentif: 0,
      diligence_eligible: false,
      diligence_bonus: 0,
      bonus_omset: 0,
      omset_total: 0,
      loan_deduction: 50_000,
      late_deduction: 10_000,
      early_leave_deduction: 5_000,
      pph_21: 0,
      other_deductions: 0,
      absence_deduction: 0,
      bpjs_tk: 0,
      bpjs_kes: 0,
      keterangan: 'kept',
    }),
    getRoleForEmployee: async () => 'employee',
    getSettings: async () => ({ transport_amount: 250_000, diligence_amount: 100_000 }),
    upsertRow: async (row) => row,
  };

  const employeeRepository = {
    findById: async () => ({
      id: 7,
      employee_id: 'E07',
      full_name: 'Test',
      basic_salary: 5_000_000,
      transport_eligible: true,
      transport_allowance_amount: null,
      diligence_allowance_amount: null,
      join_date: '2020-01-01',
    }),
    updatePayrollDefaults: async () => ({}),
  };

  const loanRequestRepository = {
    listEligibleForPayroll: async () => [],
    recordPayrollDeduction: async () => {
      loanRecordCalls += 1;
    },
  };

  const attendanceRepository = {
    countDistinctAttendanceDays: async () => {
      attendanceCalls += 1;
      return 99;
    },
    sumLateMinutesInPeriod: async () => {
      attendanceCalls += 1;
      return 999;
    },
    sumEarlyMinutesInPeriod: async () => {
      attendanceCalls += 1;
      return 999;
    },
  };

  const fieldDeliveryRepository = {
    sumBonusBetween: async () => {
      bonusCalls += 1;
      return 9_999_999;
    },
    sumOmsetBetween: async () => {
      bonusCalls += 1;
      return 9_999_999;
    },
  };

  const service = new PayrollService(
    payrollRepository,
    employeeRepository,
    loanRequestRepository,
    null,
    attendanceRepository,
    fieldDeliveryRepository
  );

  const saved = await service.updateEntry('2026-07', 7, {
    days_attended: 20,
    late_deduction: 10_000,
    early_leave_deduction: 5_000,
    overtime_pay: 100_000,
    loan_deduction: 50_000,
    keterangan: 'kept',
  });

  assert.equal(saved.days_attended, 20);
  assert.equal(saved.late_deduction, 10_000);
  assert.equal(saved.overtime_pay, 100_000);
  assert.equal(saved.loan_deduction, 50_000);
  assert.equal(attendanceCalls, 0);
  assert.equal(loanRecordCalls, 0);
  assert.equal(bonusCalls, 0);

  try {
    payrollRepository.findByPeriodAndEmployee = async () => null;
    await service.updateEntry('2026-07', 7, { days_attended: 1 });
    assert.fail('expected PAYROLL_NOT_FOUND');
  } catch (err) {
    assert.ok(err instanceof AppError);
    assert.equal(err.code, 'PAYROLL_NOT_FOUND');
  }

  console.log('payrollSaveNoAutoProcess.test.js: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
