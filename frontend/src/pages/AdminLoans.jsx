import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AdminLayout from '../components/AdminLayout.jsx';
import { Alert, Badge, Button, Card } from '../components/ui.jsx';
import { api, paths, ensureCsrf } from '../api/client.js';
import { translateApiMessage } from '../translateApi.js';
import { formatDisplayDateTime } from '../utils/formatDate.js';

function formatIdr(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

function estimateMonths(loan, monthly) {
  const l = Number(loan);
  const m = Number(monthly);
  if (!l || !m) return 0;
  return Math.ceil(l / m);
}

function statusBadgeVariant(status) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'muted';
  return 'neutral';
}

export default function AdminLoans() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('pending');
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [loading, setLoading] = useState(false);
  const [decidingId, setDecidingId] = useState(null);

  const notify = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const load = useCallback(async () => {
    setLoading(true);
    notify('');
    try {
      await ensureCsrf();
      const path =
        filter === 'pending' ? paths.adminLoanRequestsPending : paths.adminLoanRequests;
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
    load();
  }, [navigate, load]);

  const handleDecide = async (id, status) => {
    setDecidingId(id);
    notify('');
    try {
      await ensureCsrf();
      await api.put(paths.adminLoanRequest(id), { status });
      notify(
        status === 'approved' ? t('loanApproved') : t('loanRejected'),
        'success'
      );
      await load();
      window.dispatchEvent(new CustomEvent('admin-pending-refresh'));
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setDecidingId(null);
    }
  };

  const pendingCount = filter === 'pending' ? rows.length : null;

  return (
    <AdminLayout title={t('loanAdminTitle')} subtitle={t('loanAdminSubtitle')}>
      <div className="space-y-6">
        {message && (
          <Alert tone={messageTone} onDismiss={() => notify('')}>
            {message}
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          {['pending', 'approved', 'rejected', 'all'].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                filter === f
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'border border-apple-border bg-white text-apple-label hover:bg-apple-highlight hover:text-apple-text'
              }`}
            >
              {t(`loanFilter_${f}`)}
              {f === 'pending' && pendingCount != null && filter === 'pending' && (
                <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-xs">{pendingCount}</span>
              )}
            </button>
          ))}
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? t('loading') : t('payrollRefresh')}
          </Button>
        </div>

        <Card title={t('loanRequestsList')} description={t('loanAdminHint')}>
          <div className="overflow-x-auto -mx-5 sm:-mx-6">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-apple-border bg-apple-fill text-xs font-semibold text-apple-text">
                  <th className="px-4 py-3">{t('employee')}</th>
                  <th className="px-4 py-3 text-right">{t('loanAmount')}</th>
                  <th className="px-4 py-3 text-right">{t('loanMonthlyDeduction')}</th>
                  <th className="px-4 py-3 text-right">{t('loanEstMonths')}</th>
                  <th className="px-4 py-3">{t('status')}</th>
                  <th className="px-4 py-3">{t('loanSubmittedAt')}</th>
                  <th className="px-4 py-3 text-right">{t('loanActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-apple-label">
                      {loading ? t('loading') : t('loanNoRequests')}
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-apple-highlight">
                    <td className="px-4 py-3">
                      <div className="font-medium text-apple-text">{row.full_name}</div>
                      <div className="text-xs text-apple-label">{row.employee_code}</div>
                      {row.notes && (
                        <p className="mt-1 text-xs text-apple-label">{row.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      Rp {formatIdr(row.loan_amount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      Rp {formatIdr(row.monthly_deduction)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-apple-label">
                      {estimateMonths(row.loan_amount, row.monthly_deduction)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadgeVariant(row.approval_status)}>
                        {t(`loanStatus_${row.approval_status}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-apple-label">
                      {formatDisplayDateTime(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {row.approval_status === 'pending' ? (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="success"
                            size="sm"
                            disabled={decidingId === row.id}
                            onClick={() => handleDecide(row.id, 'approved')}
                          >
                            {t('loanApprove')}
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={decidingId === row.id}
                            onClick={() => handleDecide(row.id, 'rejected')}
                          >
                            {t('loanReject')}
                          </Button>
                        </div>
                      ) : (
                        <span className="block text-right text-xs text-apple-muted">
                          {row.decided_at
                            ? formatDisplayDateTime(row.decided_at)
                            : t('emDash')}
                        </span>
                      )}
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
