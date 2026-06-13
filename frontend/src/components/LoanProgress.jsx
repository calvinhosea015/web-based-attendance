import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from './ui.jsx';
import { payrollCycleLabel } from '../utils/payrollPeriod.js';

function formatIdr(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

export default function LoanProgress({ loan }) {
  const { t } = useTranslation();
  const status = loan.approval_status;

  if (status === 'pending') {
    return (
      <div className="mt-3 rounded-apple-lg bg-amber-50/80 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200/60">
        {t('loanProgressPending')}
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="mt-3 rounded-apple-lg bg-apple-fill px-3 py-2 text-sm text-apple-label ring-1 ring-black/[0.04]">
        {loan.rejection_reason || t('loanProgressRejected')}
      </div>
    );
  }

  if (status !== 'approved') return null;

  const pct = Number(loan.progress_percent) || 0;
  const paidOff = loan.is_paid_off;

  return (
    <div className="mt-3 space-y-3">
      <div>
        <div className="mb-1 flex justify-between text-xs font-medium text-apple-label">
          <span>{t('loanProgressRepayment')}</span>
          <span>{paidOff ? t('loanProgressPaidOff') : `${pct}%`}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-apple-fill ring-1 ring-black/[0.04]">
          <div
            className={`h-full rounded-full transition-all duration-premium ease-premium ${
              paidOff ? 'bg-emerald-500' : 'bg-brand-600'
            }`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-black/[0.04]">
          <p className="text-apple-muted">{t('loanProgressPaid')}</p>
          <p className="mt-0.5 font-semibold tabular-nums text-apple-text">
            Rp {formatIdr(loan.amount_paid)}
          </p>
        </div>
        <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-black/[0.04]">
          <p className="text-apple-muted">{t('loanProgressRemaining')}</p>
          <p className="mt-0.5 font-semibold tabular-nums text-apple-text">
            Rp {formatIdr(loan.remaining_balance)}
          </p>
        </div>
        <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-black/[0.04]">
          <p className="text-apple-muted">{t('loanProgressMonths')}</p>
          <p className="mt-0.5 font-semibold tabular-nums text-apple-text">
            {loan.months_paid} / {loan.months_total}
          </p>
        </div>
        <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-black/[0.04]">
          <p className="text-apple-muted">{t('loanMonthlyDeduction')}</p>
          <p className="mt-0.5 font-semibold tabular-nums text-apple-text">
            Rp {formatIdr(loan.monthly_deduction)}
          </p>
        </div>
      </div>
      {paidOff && (
        <Badge variant="success">{t('loanProgressPaidOff')}</Badge>
      )}
      {loan.deductions?.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-apple-muted">
            {t('loanProgressHistory')}
          </p>
          <ul className="space-y-1 text-xs text-apple-label">
            {loan.deductions.map((d) => (
              <li
                key={d.payroll_period}
                className="flex justify-between rounded-md bg-white px-2 py-1 ring-1 ring-black/[0.04]"
              >
                <span>{payrollCycleLabel(d.payroll_period)}</span>
                <span className="font-medium tabular-nums text-apple-text">
                  − Rp {formatIdr(d.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!paidOff && (!loan.deductions || loan.deductions.length === 0) && (
        <p className="text-xs text-apple-muted">{t('loanProgressNoDeductionsYet')}</p>
      )}
    </div>
  );
}
