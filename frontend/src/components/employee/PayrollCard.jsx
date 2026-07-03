import { useTranslation } from 'react-i18next';
import { Card } from '../ui.jsx';
import { payrollCycleLabel } from '../../utils/payrollPeriod.js';
import { formatIdr } from '../../utils/payrollDisplay.js';

export default function PayrollCard({ payroll }) {
  const { t } = useTranslation();

  return (
    <Card title={t('payrollEmployeeTitle')} description={t('payrollEmployeeHint')}>
      {payroll.length > 0 ? (
        <ul className="space-y-3 text-sm">
          {payroll.map((row) => {
            const loanDeduction = Number(row.loan_deduction || 0);
            const pph21 = Number(row.pph_21 || 0);
            const otherDeductions = Number(row.other_deductions || 0);
            const deductions = loanDeduction + pph21 + otherDeductions;
            return (
              <li
                key={row.id}
                className="rounded-apple-lg border border-black/[0.06] bg-apple-fill/50 px-4 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-apple-text">
                    {payrollCycleLabel(row.payroll_period)}
                  </span>
                  <span className="font-semibold text-brand-700">
                    Rp {formatIdr(row.final_salary)}
                  </span>
                </div>
                <dl className="mt-3 grid gap-1 text-apple-label sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-apple-label">
                      {t('payrollDaysAttended')}
                    </dt>
                    <dd className="font-medium text-apple-text">{row.days_attended ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-apple-label">
                      {t('payrollBasicSalary')}
                    </dt>
                    <dd className="font-medium text-apple-text">Rp {formatIdr(row.basic_salary)}</dd>
                  </div>
                  {(row.payroll_mode === 'monthly' ||
                    row.payroll_mode === 'umum' ||
                    row.payroll_mode === 'general_affairs' ||
                    row.payroll_mode === 'accounting') &&
                    Number(row.absence_deduction || 0) > 0 && (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-apple-label">
                        {t('payrollAbsenceDeduction')}
                      </dt>
                      <dd className="font-medium text-rose-700">
                        Rp {formatIdr(row.absence_deduction)}
                      </dd>
                    </div>
                  )}
                  {loanDeduction > 0 && (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-apple-label">
                        {t('payrollLoanDeduction')}
                      </dt>
                      <dd className="font-medium text-rose-700">Rp {formatIdr(loanDeduction)}</dd>
                    </div>
                  )}
                  {pph21 > 0 && (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-apple-label">
                        {t('payrollPph21')}
                      </dt>
                      <dd className="font-medium text-rose-700">Rp {formatIdr(pph21)}</dd>
                    </div>
                  )}
                  {otherDeductions > 0 && (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-apple-label">
                        {t('payrollOtherDeductions')}
                      </dt>
                      <dd className="font-medium text-apple-text">Rp {formatIdr(otherDeductions)}</dd>
                    </div>
                  )}
                  {Number(row.bonus_omset || 0) > 0 && (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-apple-label">
                        {t('payrollBonusOmset')}
                      </dt>
                      <dd className="font-medium text-brand-700">Rp {formatIdr(row.bonus_omset)}</dd>
                    </div>
                  )}
                  {deductions > 0 && loanDeduction > 0 && otherDeductions > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-apple-label">
                        {t('payrollDeductions')}
                      </dt>
                      <dd className="font-medium text-apple-text">Rp {formatIdr(deductions)}</dd>
                    </div>
                  )}
                  {row.keterangan ? (
                    <div className="sm:col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-apple-label">
                        {t('payrollKeterangan')}
                      </dt>
                      <dd className="font-medium text-apple-text">{row.keterangan}</dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-apple-label">{t('payrollEmployeeEmpty')}</p>
      )}
    </Card>
  );
}
