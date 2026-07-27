const assert = require('node:assert/strict');
const { PayrollService } = require('../src/services/payrollService');

/** Admin-saved row must not be rewritten when employee lists payslips. */
async function main() {
  let upsertCalls = 0;
  const payrollRepository = {
    listForEmployee: async () => [
      {
        employee_id: 7,
        payroll_period: '2026-07',
        period_start: '2026-06-25',
        period_end: '2026-07-24',
        days_attended: 18,
        final_salary: 4_200_000,
        basic_salary: 4_000_000,
        loan_deduction: 0,
      },
    ],
    getRoleForEmployee: async () => 'employee',
    upsertRow: async () => {
      upsertCalls += 1;
      throw new Error('listPayrollForEmployee must not upsert');
    },
  };
  const loanRequestRepository = {
    findActiveForEmployee: async () => null,
  };
  const service = new PayrollService(
    payrollRepository,
    null,
    loanRequestRepository,
    null,
    null
  );

  const rows = await service.listPayrollForEmployee(7);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].days_attended, 18);
  assert.equal(rows[0].final_salary, 4_200_000);
  assert.equal(upsertCalls, 0);
  console.log('payrollListNoAutoSync.test.js: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
