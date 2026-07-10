import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, paths, ensureCsrf } from '../../api/client.js';
import { translateApiMessage } from '../../translateApi.js';
import { Card, StatTile } from '../ui.jsx';
import { formatIdr } from '../../utils/payrollDisplay.js';
import { payrollCycleLabel } from '../../utils/payrollPeriod.js';

export default function FinancePayrollSummary({ period }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!period) return;
    setLoading(true);
    setError('');
    try {
      await ensureCsrf();
      const res = await api.get(paths.financePayrollPeriod(period));
      setData(res.data);
    } catch (err) {
      setData(null);
      setError(translateApiMessage(err) || String(err));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = data?.totals;
  const fieldRows = (data?.rows || []).filter((r) => r.user_role === 'field_officer');

  return (
    <Card
      title={t('headOfFinancePayrollSummary')}
      description={t('headOfFinancePayrollSummaryHint')}
    >
      {loading && <p className="text-sm text-apple-label">{t('loading')}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!loading && !error && totals && totals.employees > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-apple-label">{payrollCycleLabel(period)}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label={t('payrollFinal')}
              value={`Rp ${formatIdr(totals.payroll_sum)}`}
              sub={`${totals.employees} ${t('totalEmployees').toLowerCase()}`}
            />
            <StatTile
              label={t('payrollBonusOmset')}
              value={`Rp ${formatIdr(totals.bonus_omset_sum)}`}
              sub={t('fieldOpsTabOmset')}
            />
            <StatTile
              label={t('fieldOmsetReportTitle')}
              value={`Rp ${formatIdr(totals.omset_sum)}`}
              sub={t('fieldOmsetReportSubtitle')}
            />
          </div>
          {fieldRows.length > 0 && (
            <div className="-mx-1 overflow-auto">
              <table className="apple-table w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="apple-table-head">
                    <th>{t('employee')}</th>
                    <th className="text-right">{t('payrollDaysAttended')}</th>
                    <th className="text-right">{t('fieldOmsetReportTitle')}</th>
                    <th className="text-right">{t('payrollBonusOmset')}</th>
                    <th className="text-right">{t('payrollFinal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {fieldRows.map((row) => (
                    <tr key={row.employee_id} className="apple-table-row">
                      <td>
                        <div className="font-medium">{row.full_name}</div>
                        <div className="text-xs text-apple-label">{row.employee_code}</div>
                      </td>
                      <td className="text-right tabular-nums">{row.days_attended ?? 0}</td>
                      <td className="text-right tabular-nums">Rp {formatIdr(row.omset_total)}</td>
                      <td className="text-right tabular-nums text-brand-700">
                        Rp {formatIdr(row.bonus_omset)}
                      </td>
                      <td className="text-right tabular-nums font-medium">
                        Rp {formatIdr(row.final_salary)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {!loading && !error && (!totals || totals.employees === 0) && (
        <p className="text-sm text-apple-label">{t('headOfFinancePayrollEmpty')}</p>
      )}
    </Card>
  );
}
