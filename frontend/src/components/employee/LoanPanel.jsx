import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Field, inputClass } from '../ui.jsx';
import LoanProgress from '../LoanProgress.jsx';
import { api, paths, ensureCsrf } from '../../api/client.js';
import { formatDisplayDateTime } from '../../utils/formatDate.js';
import { formatApiError } from '../../utils/employeeFormat.js';

export default function LoanPanel({ notify }) {
  const { t } = useTranslation();
  const [loans, setLoans] = useState([]);
  const [loanForm, setLoanForm] = useState({
    loan_amount: '',
    monthly_deduction: '',
    notes: '',
  });
  const [loanSubmitting, setLoanSubmitting] = useState(false);

  const hasPendingLoan = loans.some((l) => l.approval_status === 'pending');

  const refreshLoans = async () => {
    try {
      const { data } = await api.get(paths.employeeLoans);
      setLoans(data || []);
    } catch {
      setLoans([]);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        await ensureCsrf();
        const { data } = await api.get(paths.employeeLoans);
        setLoans(data || []);
      } catch {
        setLoans([]);
      }
    };
    load();
  }, []);

  const handleLoanSubmit = async (e) => {
    e.preventDefault();
    setLoanSubmitting(true);
    notify('');
    try {
      await ensureCsrf();
      await api.post(paths.employeeLoans, {
        loan_amount: Number(loanForm.loan_amount),
        monthly_deduction: Number(loanForm.monthly_deduction),
        notes: loanForm.notes || undefined,
      });
      setLoanForm({ loan_amount: '', monthly_deduction: '', notes: '' });
      notify(t('loanSubmitted'), 'success');
      await refreshLoans();
    } catch (err) {
      notify(formatApiError(err));
    } finally {
      setLoanSubmitting(false);
    }
  };

  return (
    <Card title={t('loanTitle')} description={t('loanEmployeeHint')}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleLoanSubmit}>
        <Field label={t('loanAmount')}>
          <input
            type="number"
            min="1"
            required
            className={inputClass}
            value={loanForm.loan_amount}
            onChange={(e) => setLoanForm((f) => ({ ...f, loan_amount: e.target.value }))}
            disabled={hasPendingLoan}
          />
        </Field>
        <Field label={t('loanMonthlyDeduction')} hint={t('loanPotongGajiHint')}>
          <input
            type="number"
            min="1"
            required
            className={inputClass}
            value={loanForm.monthly_deduction}
            onChange={(e) => setLoanForm((f) => ({ ...f, monthly_deduction: e.target.value }))}
            disabled={hasPendingLoan}
          />
        </Field>
        <Field label={t('loanNotes')} className="sm:col-span-2">
          <textarea
            className={`${inputClass} min-h-[72px]`}
            value={loanForm.notes}
            onChange={(e) => setLoanForm((f) => ({ ...f, notes: e.target.value }))}
            disabled={hasPendingLoan}
            maxLength={2000}
          />
        </Field>
        <div className="sm:col-span-2">
          {hasPendingLoan && (
            <p className="mb-3 text-sm text-amber-800">{t('loanPendingExists')}</p>
          )}
          <Button type="submit" variant="primary" disabled={loanSubmitting || hasPendingLoan}>
            {loanSubmitting ? t('loading') : t('loanSubmit')}
          </Button>
        </div>
      </form>
      {loans.length > 0 && (
        <ul className="mt-6 space-y-4 border-t border-black/[0.04] pt-6">
          {loans.map((loan) => (
            <li
              key={loan.id}
              className="rounded-apple-lg border border-black/[0.06] bg-apple-fill/50 px-4 py-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-apple-text">
                    Rp {Number(loan.loan_amount).toLocaleString('id-ID')}
                  </span>
                  <span className="ml-2 text-apple-label">
                    · Rp {Number(loan.monthly_deduction).toLocaleString('id-ID')}/{t('loanPerMonth')}
                  </span>
                </div>
                <Badge
                  variant={
                    loan.approval_status === 'approved'
                      ? loan.is_paid_off
                        ? 'success'
                        : 'success'
                      : loan.approval_status === 'rejected'
                        ? 'muted'
                        : 'neutral'
                  }
                >
                  {loan.is_paid_off
                    ? t('loanProgressPaidOff')
                    : t(`loanStatus_${loan.approval_status}`)}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-apple-label">
                {t('loanSubmittedAt')}: {formatDisplayDateTime(loan.created_at)}
                {loan.decided_at && (
                  <>
                    {' '}
                    · {t('loanDecidedAt')}: {formatDisplayDateTime(loan.decided_at)}
                  </>
                )}
              </p>
              <LoanProgress loan={loan} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
