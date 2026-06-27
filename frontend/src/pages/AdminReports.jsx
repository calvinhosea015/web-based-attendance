import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AdminLayout from '../components/AdminLayout.jsx';
import {
  Alert,
  Button,
  Card,
  CompactField,
  EmptyState,
  FilterChip,
  Spinner,
  inputClass,
  inputClassCompact,
} from '../components/ui.jsx';
import { api, paths, ensureCsrf } from '../api/client.js';
import { translateApiMessage } from '../translateApi.js';
import { formatDisplayDateTime } from '../utils/formatDate.js';

const TABS = ['analytics', 'audit', 'activity'];
const SORT_KEYS = [
  { key: 'department', labelKey: 'reportsSortDepartment' },
  { key: 'attendance_rows', labelKey: 'reportsSortRecords' },
  { key: 'total_work_hours', labelKey: 'reportsSortHours' },
];
const pad = (n) => String(n).padStart(2, '0');

export default function AdminReports() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState('analytics');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('total_work_hours');
  const [sortDir, setSortDir] = useState('desc');

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      await ensureCsrf();
      const dateFrom = `${year}-${pad(month)}-01`;
      const dateTo = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;
      const { data } = await api.get(paths.adminAnalyticsDepartments, {
        params: { date_from: dateFrom, date_to: dateTo },
      });
      setDepartments(data || []);
    } catch (err) {
      setMessage(translateApiMessage(err) || String(err));
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'department' ? 'asc' : 'desc');
    }
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = departments
      .map((d) => ({
        department: d.department,
        attendance_rows: Number(d.attendance_rows || 0),
        total_work_hours: Number(d.total_work_hours || 0),
      }))
      .filter((d) => !q || d.department.toLowerCase().includes(q));
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) =>
      sortKey === 'department'
        ? a.department.localeCompare(b.department) * dir
        : (a[sortKey] - b[sortKey]) * dir
    );
    return list;
  }, [departments, search, sortKey, sortDir]);

  const meterKey = sortKey === 'attendance_rows' ? 'attendance_rows' : 'total_work_hours';
  const meterMax = useMemo(
    () => Math.max(1, ...rows.map((r) => r[meterKey])),
    [rows, meterKey]
  );

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
          <Card title={t('reportsDepartmentAttendance')}>
            <div className="flex flex-wrap items-end gap-3">
              <CompactField label={t('reportsYear')} className="w-24">
                <input
                  type="number"
                  className={inputClassCompact}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                />
              </CompactField>
              <CompactField label={t('reportsMonth')} className="w-24">
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
              <input
                type="search"
                className={`${inputClass} ml-auto w-full sm:w-56`}
                placeholder={t('reportsSearchDepartment')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={t('reportsSearchDepartment')}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-apple-muted">
                {t('reportsSortBy')}
              </span>
              {SORT_KEYS.map(({ key, labelKey }) => (
                <FilterChip
                  key={key}
                  active={sortKey === key}
                  onClick={() => toggleSort(key)}
                  aria-label={t(labelKey)}
                >
                  {t(labelKey)}
                  {sortKey === key && (
                    <span aria-hidden className="ml-1 inline-block">
                      {sortDir === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </FilterChip>
              ))}
            </div>

            <div className="mt-5">
              {departments.length === 0 ? (
                <EmptyState title={t('reportsNoData')} />
              ) : rows.length === 0 ? (
                <EmptyState title={t('reportsNoMatch')} />
              ) : (
                <ul className="divide-y divide-black/[0.04]">
                  {rows.map((row) => (
                    <li
                      key={row.department}
                      className="group -mx-3 rounded-lg px-3 py-3 transition-colors duration-300 ease-premium hover:bg-apple-highlight/60"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="truncate font-medium text-apple-text">
                          {row.department}
                        </span>
                        <span className="shrink-0 text-[13px] tabular-nums text-apple-label">
                          {t('reportsDeptRecords', { count: row.attendance_rows })} ·{' '}
                          <span className="font-medium text-apple-text">
                            {row.total_work_hours.toFixed(1)}h
                          </span>
                        </span>
                      </div>
                      <div
                        className="mt-2 h-2 overflow-hidden rounded-full bg-apple-fill"
                        role="presentation"
                      >
                        <div
                          className="h-full rounded-full bg-brand-600 transition-all duration-premium ease-premium group-hover:bg-brand-500"
                          style={{
                            width: `${Math.max(2, (row[meterKey] / meterMax) * 100)}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
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
