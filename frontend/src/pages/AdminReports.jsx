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
import { Alert, Card, FilterChip } from '../components/ui.jsx';
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

        {loading && <p className="text-sm text-apple-label">{t('loading')}</p>}

        {tab === 'analytics' && !loading && (
          <div className="space-y-6">
            <Card title={t('reportsMonthlyAttendance')}>
              <div className="mb-4 flex flex-wrap gap-3">
                <label className="text-sm text-apple-label">
                  {t('reportsYear')}
                  <input
                    type="number"
                    className="ml-2 rounded-lg border border-black/10 px-2 py-1"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                  />
                </label>
                <label className="text-sm text-apple-label">
                  {t('reportsMonth')}
                  <input
                    type="number"
                    min={1}
                    max={12}
                    className="ml-2 rounded-lg border border-black/10 px-2 py-1"
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="text-sm font-medium text-brand-600"
                  onClick={loadAnalytics}
                >
                  {t('reportsRefresh')}
                </button>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#007aff" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title={t('reportsDepartmentAttendance')}>
              <ul className="divide-y divide-black/[0.04] text-sm">
                {departments.map((row) => (
                  <li key={row.department} className="flex justify-between py-2">
                    <span>{row.department}</span>
                    <span className="text-apple-label">
                      {row.attendance_rows} · {Number(row.total_work_hours).toFixed(1)}h
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title={t('reportsOvertimeTrends')}>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={overtime}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="overtime_hours" stroke="#ff9500" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card title={t('reportsPayrollTrends')}>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={payrollTrends}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="payroll_period" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="total_final" fill="#34c759" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </div>
        )}

        {tab === 'audit' && !loading && (
          <Card title={t('reportsAuditLogs')}>
            <ul className="divide-y divide-black/[0.04] text-sm">
              {auditLogs.map((row) => (
                <li key={row.id} className="py-3">
                  <div className="font-medium text-apple-text">
                    {row.action}
                    {row.resource_type ? ` · ${row.resource_type}` : ''}
                  </div>
                  <div className="text-xs text-apple-label">
                    {formatDisplayDateTime(row.created_at)}
                    {row.ip_address ? ` · ${row.ip_address}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {tab === 'activity' && !loading && (
          <Card title={t('reportsActivityLogs')}>
            <ul className="divide-y divide-black/[0.04] text-sm">
              {activityLogs.map((row) => (
                <li key={row.id} className="flex justify-between gap-4 py-2">
                  <span className="font-mono text-xs">
                    {row.method} {row.path}
                  </span>
                  <span className="text-apple-label">
                    {row.status_code} · {row.duration_ms}ms
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
