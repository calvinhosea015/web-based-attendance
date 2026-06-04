import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AdminLayout from '../components/AdminLayout.jsx';
import { Alert, Button, Card, Field, StatTile, inputClass } from '../components/ui.jsx';
import { api, paths } from '../api/client.js';
import { translateApiMessage } from '../translateApi.js';
import { ROLE_ADMIN, canViewFieldOmsetReport } from '../roles.js';
import {
  currentPayrollPeriodKey,
  payrollCycleLabel,
  periodLabelCalendar,
} from '../utils/payrollPeriod.js';

function formatIdr(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

export default function FinanceFieldOmset() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const role = localStorage.getItem('role');
  const isAdmin = role === ROLE_ADMIN;

  const initialPeriod = () => {
    const q = searchParams.get('period');
    if (q && /^\d{4}-\d{2}$/.test(q)) return q;
    return currentPayrollPeriodKey();
  };

  const [period, setPeriod] = useState(initialPeriod);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await api.get(paths.financeFieldOmset(period));
      setReport(res.data);
    } catch (err) {
      setReport(null);
      setMessage(translateApiMessage(err) || t('dashboardLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [period, t]);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      navigate('/login');
      return;
    }
    if (!canViewFieldOmsetReport(role)) {
      navigate('/login');
      return;
    }
    loadReport();
  }, [loadReport, navigate, role]);

  const backTo =
    isAdmin ? (
      <Link to={`/admin/payroll`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
        ← {t('payrollTitle')}
      </Link>
    ) : (
      <Link to="/employee" className="text-sm font-medium text-brand-600 hover:text-brand-700">
        ← {t('payrollEmployeeTitle')}
      </Link>
    );

  const periodControls = (
    <div className="flex flex-wrap items-end gap-3">
      <Field label={t('payrollMonth')}>
        <input
          type="month"
          className={inputClass}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        />
      </Field>
      <Button variant="primary" onClick={loadReport} disabled={loading}>
        {loading ? t('loading') : t('fieldOmsetRefresh')}
      </Button>
    </div>
  );

  const body = (
    <div className="space-y-6">
      {message && <Alert tone="error">{message}</Alert>}
      {periodControls}

      {report && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label={t('payrollMonth')}
              value={periodLabelCalendar(period)}
              sub={payrollCycleLabel(period)}
            />
            <StatTile
              label={t('fieldOmsetTotal')}
              value={`Rp ${formatIdr(report.total_omset)}`}
              sub={t('fieldOmsetFromCodesHint')}
            />
            <StatTile
              label={t('fieldOmsetBonusTotal')}
              value={`Rp ${formatIdr(report.total_bonus)}`}
              sub={t('fieldOmsetBonusHint', { count: report.delivery_count })}
            />
          </div>

          <Card title={t('fieldOmsetByEmployee')} description={t('fieldOmsetByEmployeeHint')}>
            {!report.employees?.length ? (
              <p className="text-sm text-slate-600">{t('fieldOmsetEmpty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">{t('employee')}</th>
                      <th className="px-3 py-2 text-right">{t('fieldOmsetDeliveries')}</th>
                      <th className="px-3 py-2 text-right">{t('fieldOmsetTotal')}</th>
                      <th className="px-3 py-2 text-right">{t('fieldOmsetBonusTotal')}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.employees.map((emp) => (
                      <React.Fragment key={emp.employee_id}>
                        <tr className="hover:bg-slate-50/80">
                          <td className="px-3 py-3">
                            <div className="font-medium text-slate-900">{emp.full_name}</div>
                            <div className="text-xs text-slate-500">{emp.employee_code}</div>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{emp.delivery_count}</td>
                          <td className="px-3 py-3 text-right tabular-nums font-medium text-slate-900">
                            Rp {formatIdr(emp.omset_total)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-brand-700">
                            Rp {formatIdr(emp.bonus_total)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setExpandedId((id) =>
                                  id === emp.employee_id ? null : emp.employee_id
                                )
                              }
                            >
                              {expandedId === emp.employee_id
                                ? t('fieldOmsetHideLines')
                                : t('fieldOmsetShowLines')}
                            </Button>
                          </td>
                        </tr>
                        {expandedId === emp.employee_id && (
                          <tr>
                            <td colSpan={5} className="bg-slate-50/80 px-3 py-3">
                              <ul className="space-y-2 text-xs text-slate-700">
                                {emp.deliveries.map((d) => (
                                  <li
                                    key={d.id}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                                  >
                                    <div className="flex flex-wrap justify-between gap-2">
                                      <span className="font-medium text-slate-900">
                                        {d.valid_on} · {d.pabrik_code} · {d.kode_barang}
                                      </span>
                                      <span>
                                        {t('fieldOmsetLineAmounts', {
                                          omset: formatIdr(d.omset_amount),
                                          bonus: formatIdr(d.bonus_amount),
                                        })}
                                      </span>
                                    </div>
                                    <div className="mt-1 text-slate-500">
                                      {t('fieldDelivery_selisih')}: {d.selisih} kg ·{' '}
                                      {t('pabrikItemTonase')}: {d.tonase_per_item}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );

  if (isAdmin) {
    return (
      <AdminLayout title={t('fieldOmsetReportTitle')} subtitle={t('fieldOmsetReportSubtitle')}>
        <div className="mb-4">{backTo}</div>
        {body}
      </AdminLayout>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {backTo}
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">{t('fieldOmsetReportTitle')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('fieldOmsetReportSubtitle')}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
          {t('logout')}
        </Button>
      </div>
      {body}
    </div>
  );
}
