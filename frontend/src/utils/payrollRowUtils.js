import { isMonthlyPayrollMode } from '../roles.js';

/** Rows finance/admin should double-check before export. */
export function payrollRowNeedsAttention(row, requiredWorkDays) {
  const expected =
    row.expected_work_days ?? requiredWorkDays ?? null;
  const days = Number(row.days_attended ?? 0);
  const loanPreview = Number(row.loan_deduction_preview || 0);
  const loanApplied = Number(row.loan_deduction || 0);

  if (row.has_active_loan && loanApplied === 0 && loanPreview > 0) return true;
  if (Number(row.final_salary || 0) <= 0 && row.payroll_mode !== 'manual') return true;

  if (expected != null && expected > 0) {
    const absent = Math.max(0, expected - days);
    if (isMonthlyPayrollMode(row.payroll_mode) && absent > 0 && absent >= expected) {
      return true;
    }
  }

  return false;
}

export function payrollWorkflowStep({ rows, periodSelected }) {
  if (!periodSelected) return 1;
  if (!rows?.length) return 2;
  return 3;
}
