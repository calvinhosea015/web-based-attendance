import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AdminLayout from '../components/AdminLayout.jsx';
import {
  Alert,
  Button,
  Card,
  CompactField,
  EmptyState,
  FilterChip,
  Spinner,
  inputClassCompact,
} from '../components/ui.jsx';
import { CHART_COLORS, CHART_TOOLTIP_STYLE } from '../theme.js';
import { api, paths, ensureCsrf } from '../api/client.js';
import { translateApiMessage } from '../translateApi.js';
import { formatDisplayDateTime } from '../utils/formatDate.js';

const TABS = ['analytics', 'audit', 'activity'];

export default function AdminReports() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState('analytics');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [monthly, setMonthly] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [overtime, setOvertime] = useState([]);
  const [payrollTrends, setPayrollTrends] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const monthlyChart = useMemo(
    () =>
      monthly.map((row) => ({
        status: row.attendance_status,
        count: Number(row.cnt || 0),
      })),
    [monthly]
  );

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      await ensureCsrf();
      const [m, d, o, p] = await Promise.all([
        api.get(paths.adminAnalyticsMonthly, { params: { year, month } }),
        api.get(paths.adminAnalyticsDepartments),
        api.get(paths.adminAnalyticsOvertime),
        api.get(paths.adminAnalyticsPayroll),
      ]);
      setMonthly(m.data || []);
      setDepartments(d.data || []);
      setOvertime(o.data || []);
      setPayrollTrends((p.data || []).reverse());
    } catch (err) {
      setMessage(translateApiMessage(err) || String(err));
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      await ensureCsrf();
      if (tab === 'audit') {
        const { data } = await api.get(paths.adminAuditLogs);
        setAuditLogs(data || []);
      } else if (tab === 'activity') {
        const { data } = await api.get(paths.adminActivityLogs);
        setActivityLogs(data || []);
      }
    } catch (err) {
      setMessage(translateApiMessage(err) || String(err));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('role') !== 'admin') {
      navigate('/login');
      return;
    }
    if (tab === 'analytics') loadAnalytics();
    else loadLogs();
  }, [navigate, tab, loadAnalytics, loadLogs]);

  return (
    <AdminLayout title={t('reportsTitle')} subtitle={t('reportsSubtitle')}>
      <div className="space-y-6">
        {message && <Alert tone="error">{message}</Alert>}

        <div className="flex flex-wrap gap-2">
          {TABS.map((key) => (
            <FilterChip key={key} active={tab === key} onClick={() => setTab(key)}>
              {t(`reportsTab_${key}`)}
            </FilterChip>
          ))}
        </div>

        {loading && <Spinner />}

        {tab === 'analytics' && !loading && (
          <div className="space-y-6">
            <Card title={t('reportsMonthlyAttendance')}>
              <div className="mb-5 flex flex-wrap items-end gap-3">
                <CompactField label={t('reportsYear')} className="w-28">
                  <input
                    type="number"
                    className={inputClassCompact}
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                  />
                </CompactField>
                <CompactField label={t('reportsMonth')} className="w-28">
                  <input
                    type="number"
                    min={1}
                    max={12}
                    className={inputClassCompact}
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                  />
                </CompactField>
                <Button variant="secondary" size="sm" onClick={loadAnalytics}>
                  {t('reportsRefresh')}
                </Button>
              </div>
              {monthlyChart.length === 0 ? (
                <EmptyState title={t('reportsNoData')} />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                      <XAxis dataKey="status" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                      <Bar dataKey="count" fill={CHART_COLORS.brand} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card title={t('reportsDepartmentAttendance')}>
              {departments.length === 0 ? (
                <EmptyState title={t('reportsNoData')} />
              ) : (
                <ul className="divide-y divide-black/[0.04] text-[15px]">
                  {departments.map((row) => (
                    <li key={row.department} className="flex justify-between gap-4 py-2.5">
                      <span className="text-apple-text">{row.department}</span>
                      <span className="text-apple-label tabular-nums">
                        {row.attendance_rows} · {Number(row.total_work_hours).toFixed(1)}h
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title={t('reportsOvertimeTrends')}>
                {overtime.length === 0 ? (
                  <EmptyState title={t('reportsNoData')} />
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={overtime}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                        <Line type="monotone" dataKey="overtime_hours" stroke={CHART_COLORS.warning} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
              <Card title={t('reportsPayrollTrends')}>
                {payrollTrends.length === 0 ? (
                  <EmptyState title={t('reportsNoData')} />
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={payrollTrends}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                        <XAxis dataKey="payroll_period" tick={{ fontSize: 11, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                        <Bar dataKey="total_final" fill={CHART_COLORS.positive} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {tab === 'audit' && !loading && (
          <Card title={t('reportsAuditLogs')}>
            {auditLogs.length === 0 ? (
              <EmptyState title={t('reportsNoData')} />
            ) : (
              <ul className="divide-y divide-black/[0.04] text-[15px]">
                {auditLogs.map((row) => (
                  <li key={row.id} className="py-3">
                    <div className="font-medium text-apple-text">
                      {row.action}
                      {row.resource_type ? ` · ${row.resource_type}` : ''}
                    </div>
                    <div className="text-[12px] text-apple-muted">
                      {formatDisplayDateTime(row.created_at)}
                      {row.ip_address ? ` · ${row.ip_address}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === 'activity' && !loading && (
          <Card title={t('reportsActivityLogs')}>
            {activityLogs.length === 0 ? (
              <EmptyState title={t('reportsNoData')} />
            ) : (
              <ul className="divide-y divide-black/[0.04] text-[15px]">
                {activityLogs.map((row) => (
                  <li key={row.id} className="flex justify-between gap-4 py-2.5">
                    <span className="font-mono text-[12px]">
                      {row.method} {row.path}
                    </span>
                    <span className="text-apple-label tabular-nums">
                      {row.status_code} · {row.duration_ms}ms
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
