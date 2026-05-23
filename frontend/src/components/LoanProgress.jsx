import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from './ui.jsx';

function formatIdr(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

function periodLabel(period) {
  const [y, m] = String(period || '').split('-').map(Number);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return m >= 1 && m <= 12 ? `${months[m - 1]} ${y}` : period;
}

export default function LoanProgress({ loan }) {
  const { t } = useTranslation();
  const status = loan.approval_status;

  if (status === 'pending') {
    return (
      <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
        {t('loanProgressPending')}
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
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
        <div className="mb-1 flex justify-between text-xs font-medium text-slate-600">
          <span>{t('loanProgressRepayment')}</span>
          <span>{paidOff ? t('loanProgressPaidOff') : `${pct}%`}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all ${
              paidOff ? 'bg-emerald-500' : 'bg-brand-600'
            }`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-slate-100">
          <p className="text-slate-500">{t('loanProgressPaid')}</p>
          <p className="mt-0.5 font-semibold tabular-nums text-slate-900">
            Rp {formatIdr(loan.amount_paid)}
          </p>
        </div>
        <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-slate-100">
          <p className="text-slate-500">{t('loanProgressRemaining')}</p>
          <p className="mt-0.5 font-semibold tabular-nums text-slate-900">
            Rp {formatIdr(loan.remaining_balance)}
          </p>
        </div>
        <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-slate-100">
          <p className="text-slate-500">{t('loanProgressMonths')}</p>
          <p className="mt-0.5 font-semibold tabular-nums text-slate-900">
            {loan.months_paid} / {loan.months_total}
          </p>
        </div>
        <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-slate-100">
          <p className="text-slate-500">{t('loanMonthlyDeduction')}</p>
          <p className="mt-0.5 font-semibold tabular-nums text-slate-900">
            Rp {formatIdr(loan.monthly_deduction)}
          </p>
        </div>
      </div>
      {paidOff && (
        <Badge variant="success">{t('loanProgressPaidOff')}</Badge>
      )}
      {loan.deductions?.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('loanProgressHistory')}
          </p>
          <ul className="space-y-1 text-xs text-slate-600">
            {loan.deductions.map((d) => (
              <li
                key={d.payroll_period}
                className="flex justify-between rounded-md bg-white px-2 py-1 ring-1 ring-slate-100"
              >
                <span>{periodLabel(d.payroll_period)}</span>
                <span className="font-medium tabular-nums text-slate-800">
                  − Rp {formatIdr(d.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!paidOff && (!loan.deductions || loan.deductions.length === 0) && (
        <p className="text-xs text-slate-500">{t('loanProgressNoDeductionsYet')}</p>
      )}
    </div>
  );
}
