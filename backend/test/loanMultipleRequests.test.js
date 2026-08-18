const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { AppError } = require('../src/utils/errors');
const { pool } = require('../src/db/pool');
const { LoanRequestRepository } = require('../src/repositories/loanRequestRepository');
const { LoanService } = require('../src/services/loanService');
const { PayrollService } = require('../src/services/payrollService');

describe('multiple loan requests', () => {
  it('allows an employee to submit more than one loan with its own repayment start period', async () => {
    const created = [];
    const service = new LoanService({
      create: async (row) => {
        created.push(row);
        return { id: created.length, ...row };
      },
    });

    await service.submit(
      { employeeId: 7 },
      {
        loan_amount: 1_000_000,
        monthly_deduction: 200_000,
        repayment_start_period: '2026-09',
      }
    );
    await service.submit(
      { employeeId: 7 },
      {
        loan_amount: 500_000,
        monthly_deduction: 100_000,
        repayment_start_period: '2026-10',
      }
    );

    assert.deepEqual(created, [
      {
        employeeId: 7,
        loanAmount: 1_000_000,
        monthlyDeduction: 200_000,
        repaymentStartPeriod: '2026-09',
        notes: null,
      },
      {
        employeeId: 7,
        loanAmount: 500_000,
        monthlyDeduction: 100_000,
        repaymentStartPeriod: '2026-10',
        notes: null,
      },
    ]);
  });

  it('allows approval when the employee already has another active loan', async () => {
    const service = new LoanService({
      setDecision: async (id, data) => ({ id, approval_status: data.status }),
    });

    const row = await service.decide(12, { userId: 3 }, { status: 'approved' });
    assert.deepEqual(row, { id: 12, approval_status: 'approved' });
  });

  it('requires a valid repayment start period', async () => {
    const service = new LoanService({ create: async () => ({}) });

    await assert.rejects(
      () =>
        service.submit(
          { employeeId: 7 },
          {
            loan_amount: 1_000_000,
            monthly_deduction: 200_000,
            repayment_start_period: '2026-13',
          }
        ),
      (err) => err instanceof AppError && err.code === 'LOAN_START_PERIOD'
    );
  });
});

describe('multiple-loan payroll deductions', () => {
  it('sums every eligible loan and records each unrecorded deduction', async () => {
    const records = [];
    const loanRequestRepository = {
      listEligibleForPayroll: async (_employeeId, payrollPeriod) => {
        if (payrollPeriod === '2026-08') {
          return [
            {
              id: 1,
              loan_amount: 1_000_000,
              monthly_deduction: 200_000,
              remaining_balance: 800_000,
              repayment_start_period: '2026-08',
              recorded_deduction: null,
            },
          ];
        }
        if (payrollPeriod === '2026-09') {
          return [
            {
              id: 1,
              loan_amount: 1_000_000,
              monthly_deduction: 200_000,
              remaining_balance: 800_000,
              repayment_start_period: '2026-08',
              recorded_deduction: null,
            },
            {
              id: 2,
              loan_amount: 500_000,
              monthly_deduction: 150_000,
              remaining_balance: 100_000,
              repayment_start_period: '2026-09',
              recorded_deduction: null,
            },
          ];
        }
        return [];
      },
      recordPayrollDeduction: async (row) => {
        records.push(row);
        return { amount: row.amount };
      },
    };
    const service = new PayrollService(null, null, loanRequestRepository, null, null);

    assert.equal((await service.previewLoanDeduction(7, '2026-07')).amount, 0);
    assert.equal((await service.previewLoanDeduction(7, '2026-08')).amount, 200_000);

    const preview = await service.previewLoanDeduction(7, '2026-09');
    assert.equal(preview.amount, 300_000);
    assert.equal(service.loanContextFromPreview(preview).active_loan_count, 2);

    assert.equal(await service.resolveLoanDeduction(7, '2026-09'), 300_000);
    assert.deepEqual(records, [
      { loanRequestId: 1, payrollPeriod: '2026-09', amount: 200_000 },
      { loanRequestId: 2, payrollPeriod: '2026-09', amount: 100_000 },
    ]);
  });

  it('preserves a recorded final instalment when that payroll period is regenerated', async () => {
    let recordCalls = 0;
    const service = new PayrollService(
      null,
      null,
      {
        listEligibleForPayroll: async () => [
          {
            id: 3,
            loan_amount: 1_000_000,
            monthly_deduction: 200_000,
            remaining_balance: 0,
            repayment_start_period: '2026-09',
            recorded_deduction: 75_000,
          },
        ],
        recordPayrollDeduction: async () => {
          recordCalls += 1;
        },
      },
      null,
      null
    );

    assert.equal(await service.resolveLoanDeduction(7, '2026-09'), 75_000);
    assert.equal(recordCalls, 0);
  });

  it('records the ledger and remaining balance atomically', async (t) => {
    const originalConnect = pool.connect;
    const queries = [];
    let released = false;
    const client = {
      query: async (sql, params) => {
        const statement = sql.replace(/\s+/g, ' ').trim();
        queries.push({ statement, params });
        if (statement === 'BEGIN' || statement === 'COMMIT') return { rows: [] };
        if (statement.startsWith('SELECT id, loan_amount, remaining_balance')) {
          return { rows: [{ id: 3, loan_amount: '100', remaining_balance: '75' }] };
        }
        if (statement.startsWith('SELECT amount FROM loan_payroll_deductions')) {
          return { rows: [] };
        }
        if (statement.startsWith('INSERT INTO loan_payroll_deductions')) {
          assert.deepEqual(params, [3, '2026-09', 75]);
          return { rows: [{ amount: '75' }] };
        }
        if (statement.startsWith('UPDATE loan_requests SET')) {
          assert.deepEqual(params, [3, 75]);
          return { rows: [{ id: 3, remaining_balance: '0' }] };
        }
        assert.fail(`Unexpected query: ${statement}`);
      },
      release: () => {
        released = true;
      },
    };
    pool.connect = async () => client;
    t.after(() => {
      pool.connect = originalConnect;
    });

    const result = await new LoanRequestRepository().recordPayrollDeduction({
      loanRequestId: 3,
      payrollPeriod: '2026-09',
      amount: 200,
    });

    assert.deepEqual(result, {
      amount: 75,
      loan: { id: 3, remaining_balance: '0' },
      alreadyRecorded: false,
    });
    assert.deepEqual(
      queries.map((query) => query.statement),
      [
        'BEGIN',
        'SELECT id, loan_amount, remaining_balance FROM loan_requests WHERE id = $1 FOR UPDATE',
        'SELECT amount FROM loan_payroll_deductions WHERE loan_request_id = $1 AND payroll_period = $2',
        'INSERT INTO loan_payroll_deductions (loan_request_id, payroll_period, amount) VALUES ($1, $2, $3) ON CONFLICT (loan_request_id, payroll_period) DO NOTHING RETURNING amount',
        'UPDATE loan_requests SET remaining_balance = GREATEST(0, COALESCE(remaining_balance, loan_amount) - $2) WHERE id = $1 RETURNING *',
        'COMMIT',
      ]
    );
    assert.equal(released, true);
  });
});
