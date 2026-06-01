import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AdminLayout from '../components/AdminLayout.jsx';
import { Alert, Badge, Button, Card, Field, inputClass } from '../components/ui.jsx';
import { api, paths, ensureCsrf } from '../api/client.js';
import { translateApiMessage } from '../translateApi.js';

function statusBadgeVariant(status) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'muted';
  return 'neutral';
}

export default function AdminLeave() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('pending');
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState({
    medical_days_per_year: '',
    unpaid_days_per_year: '',
    paternity_days_per_year: '',
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [loading, setLoading] = useState(false);
  const [decidingId, setDecidingId] = useState(null);

  const notify = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const loadSettings = useCallback(async () => {
    try {
      const { data } = await api.get(paths.adminLeaveSettings);
      setSettings({
        medical_days_per_year: String(data.medical_days_per_year ?? ''),
        unpaid_days_per_year: String(data.unpaid_days_per_year ?? ''),
        paternity_days_per_year: String(data.paternity_days_per_year ?? ''),
      });
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    notify('');
    try {
      await ensureCsrf();
      const path =
        filter === 'pending' ? paths.adminLeaveRequestsPending : paths.adminLeaveRequests;
      const config =
        filter === 'pending' || filter === 'all'
          ? undefined
          : { params: { status: filter } };
      const { data } = await api.get(path, config);
      setRows(data);
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('role') !== 'admin') {
      navigate('/login');
      return;
    }
    loadSettings();
    load();
  }, [navigate, load, loadSettings]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSettingsSaving(true);
    notify('');
    try {
      await ensureCsrf();
      await api.put(paths.adminLeaveSettings, {
        medical_days_per_year: Number(settings.medical_days_per_year),
        unpaid_days_per_year: Number(settings.unpaid_days_per_year),
        paternity_days_per_year: Number(settings.paternity_days_per_year),
      });
      notify(t('leaveSettingsSaved'), 'success');
      await loadSettings();
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleDecide = async (id, status, isPaid) => {
    setDecidingId(id);
    notify('');
    try {
      await ensureCsrf();
      const body = { status };
      if (status === 'approved' && isPaid !== undefined) {
        body.is_paid = isPaid;
      }
      await api.put(paths.adminLeaveRequest(id), body);
      notify(status === 'approved' ? t('leaveApproved') : t('leaveRejected'), 'success');
      await load();
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setDecidingId(null);
    }
  };

  const openAttachment = async (filename) => {
    if (!filename) return;
    try {
      await ensureCsrf();
      const res = await api.get(paths.leaveAttachment(filename), { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    }
  };

  const pendingCount = filter === 'pending' ? rows.length : null;

  return (
    <AdminLayout title={t('leaveAdminTitle')} subtitle={t('leaveAdminSubtitle')}>
      <div className="space-y-6">
        {message && (
          <Alert tone={messageTone} onDismiss={() => notify('')}>
            {message}
          </Alert>
        )}

        <Card title={t('leaveSettingsTitle')} description={t('leaveSettingsHint')}>
          <form className="grid gap-4 sm:grid-cols-3" onSubmit={handleSaveSettings}>
            <Field label={t('leaveMedicalQuota')}>
              <input
                type="number"
                min="0"
                step="0.5"
                required
                className={inputClass}
                value={settings.medical_days_per_year}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, medical_days_per_year: e.target.value }))
                }
              />
            </Field>
            <Field label={t('leaveUnpaidQuota')}>
              <input
                type="number"
                min="0"
                step="0.5"
                required
                className={inputClass}
                value={settings.unpaid_days_per_year}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, unpaid_days_per_year: e.target.value }))
                }
              />
            </Field>
            <Field label={t('leavePaternityQuota')}>
              <input
                type="number"
                min="0"
                step="0.5"
                required
                className={inputClass}
                value={settings.paternity_days_per_year}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, paternity_days_per_year: e.target.value }))
                }
              />
            </Field>
            <div className="sm:col-span-3">
              <Button type="submit" variant="primary" disabled={settingsSaving}>
                {settingsSaving ? t('loading') : t('leaveSettingsSave')}
              </Button>
            </div>
          </form>
        </Card>

        <div className="flex flex-wrap gap-2">
          {['pending', 'approved', 'rejected', 'all'].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                filter === f
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t(`leaveFilter_${f}`)}
              {f === 'pending' && pendingCount != null && filter === 'pending' && (
                <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-xs">{pendingCount}</span>
              )}
            </button>
          ))}
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? t('loading') : t('payrollRefresh')}
          </Button>
        </div>

        <Card title={t('leaveRequestsList')} description={t('leaveAdminHint')}>
          <div className="overflow-x-auto -mx-5 sm:-mx-6">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">{t('employee')}</th>
                  <th className="px-4 py-3">{t('leaveType')}</th>
                  <th className="px-4 py-3">{t('leaveDates')}</th>
                  <th className="px-4 py-3 text-right">{t('leaveDays')}</th>
                  <th className="px-4 py-3">{t('leavePayStatus')}</th>
                  <th className="px-4 py-3">{t('status')}</th>
                  <th className="px-4 py-3">{t('leaveSubmittedAt')}</th>
                  <th className="px-4 py-3 text-right">{t('leaveActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                      {loading ? t('loading') : t('leaveNoRequests')}
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.full_name}</div>
                      <div className="text-xs text-slate-500">{row.employee_code}</div>
                      {row.reason && <p className="mt-1 text-xs text-slate-500">{row.reason}</p>}
                    </td>
                    <td className="px-4 py-3">{t(`leaveType_${row.leave_type}`)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {row.start_date} — {row.end_date}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.days_count}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {row.approval_status === 'approved' ? (
                        row.is_paid ? t('leavePaid') : t('leaveUnpaid')
                      ) : row.leave_type === 'paternity' && row.approval_status === 'pending' ? (
                        t('leavePaternityChooseOnApprove')
                      ) : row.leave_type === 'medical' ? (
                        t('leavePaid')
                      ) : row.leave_type === 'unpaid' ? (
                        t('leaveUnpaid')
                      ) : (
                        t('emDash')
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadgeVariant(row.approval_status)}>
                        {t(`leaveStatus_${row.approval_status}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-end gap-1.5">
                        {row.attachment_path && (
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => openAttachment(row.attachment_path)}
                          >
                            {t('leaveViewDocument')}
                          </Button>
                        )}
                        {row.approval_status === 'pending' ? (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {row.leave_type === 'paternity' ? (
                              <>
                                <Button
                                  variant="success"
                                  size="sm"
                                  disabled={decidingId === row.id}
                                  onClick={() => handleDecide(row.id, 'approved', true)}
                                >
                                  {t('leaveApprovePaid')}
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={decidingId === row.id}
                                  onClick={() => handleDecide(row.id, 'approved', false)}
                                >
                                  {t('leaveApproveUnpaid')}
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="success"
                                size="sm"
                                disabled={decidingId === row.id}
                                onClick={() => handleDecide(row.id, 'approved')}
                              >
                                {t('leaveApprove')}
                              </Button>
                            )}
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={decidingId === row.id}
                              onClick={() => handleDecide(row.id, 'rejected')}
                            >
                              {t('leaveReject')}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {row.approved_at
                              ? new Date(row.approved_at).toLocaleString()
                              : t('emDash')}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
