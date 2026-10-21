import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AdminLayout from '../components/AdminLayout.jsx';
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '../components/ui.jsx';
import { api, paths, ensureCsrf } from '../api/client.js';
import { translateApiMessage } from '../translateApi.js';
import { formatDisplayDate, formatDisplayDateTime } from '../utils/formatDate.js';
import { formatIdr } from '../utils/payrollDisplay.js';

export default function AdminCorrections() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [backdates, setBackdates] = useState([]);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [loading, setLoading] = useState(false);
  const [decidingId, setDecidingId] = useState(null);
  const [decidingBackdateId, setDecidingBackdateId] = useState(null);
  const [approvingAllBackdates, setApprovingAllBackdates] = useState(false);

  const notify = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const load = useCallback(async ({ clearMessage = true } = {}) => {
    setLoading(true);
    if (clearMessage) notify('');
    try {
      await ensureCsrf();
      const [correctionsRes, backdatesRes] = await Promise.all([
        api.get(paths.adminAttendanceCorrectionsPending),
        api.get(paths.adminFieldDeliveryBackdatesPending),
      ]);
      setRows(Array.isArray(correctionsRes.data) ? correctionsRes.data : []);
      setBackdates(Array.isArray(backdatesRes.data) ? backdatesRes.data : []);
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
      setRows([]);
      setBackdates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDecide = async (id, status) => {
    setDecidingId(id);
    notify('');
    try {
      await ensureCsrf();
      await api.put(paths.adminAttendanceCorrection(id), { status });
      notify(
        status === 'approved' ? t('correctionApproved') : t('correctionRejected'),
        'success'
      );
      await load({ clearMessage: false });
      window.dispatchEvent(new CustomEvent('admin-pending-refresh'));
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setDecidingId(null);
    }
  };

  const handleBackdateDecide = async (id, status) => {
    setDecidingBackdateId(id);
    notify('');
    try {
      await ensureCsrf();
      await api.put(paths.adminFieldDeliveryBackdate(id), { status });
      notify(
        status === 'approved' ? t('fieldBackdateApproved') : t('fieldBackdateRejected'),
        'success'
      );
      await load({ clearMessage: false });
      window.dispatchEvent(new CustomEvent('admin-pending-refresh'));
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setDecidingBackdateId(null);
    }
  };

  const handleApproveAllBackdates = async () => {
    if (backdates.length === 0) return;

    setApprovingAllBackdates(true);
    notify('');
    const total = backdates.length;

    try {
      await ensureCsrf();
      const results = await Promise.allSettled(
        backdates.map((row) =>
          api.put(paths.adminFieldDeliveryBackdate(row.id), { status: 'approved' })
        )
      );
      const approved = results.filter((result) => result.status === 'fulfilled').length;

      if (approved === total) {
        notify(t('fieldBackdateAllApproved', { count: approved }), 'success');
      } else {
        notify(t('fieldBackdateApproveAllPartial', { approved, total }), 'error');
      }

      await load({ clearMessage: false });
      window.dispatchEvent(new CustomEvent('admin-pending-refresh'));
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setApprovingAllBackdates(false);
    }
  };

  return (
    <AdminLayout title={t('correctionAdminTitle')} subtitle={t('correctionAdminSubtitle')}>
      <div className="space-y-6">
        {message && (
          <Alert tone={messageTone} onDismiss={() => notify('')}>
            {message}
          </Alert>
        )}

        <Card title={t('correctionPendingTitle')} description={t('correctionPendingHint')}>
          {loading ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <EmptyState title={t('correctionNoPending')} />
          ) : (
            <ul className="divide-y divide-black/[0.04]">
              {rows.map((row) => {
                const changes =
                  typeof row.requested_changes === 'string'
                    ? JSON.parse(row.requested_changes)
                    : row.requested_changes || {};
                return (
                  <li key={row.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="font-semibold text-apple-text">
                        {row.full_name}{' '}
                        <span className="font-normal text-apple-label">({row.employee_code})</span>
                      </div>
                      <p className="mt-1 text-apple-label">{row.reason}</p>
                      <div className="mt-2 space-y-1 text-xs text-apple-label">
                        {changes.check_in != null && (
                          <div>
                            {t('correctionRequestedCheckIn')}:{' '}
                            {formatDisplayDateTime(changes.check_in)}
                          </div>
                        )}
                        {Object.prototype.hasOwnProperty.call(changes, 'check_out') && (
                          <div>
                            {t('correctionRequestedCheckOut')}:{' '}
                            {changes.check_out
                              ? formatDisplayDateTime(changes.check_out)
                              : t('notCheckedOut')}
                          </div>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-apple-muted">
                        {t('correctionSubmittedAt')}: {formatDisplayDateTime(row.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="neutral">{t('leaveStatus_pending')}</Badge>
                      <Button
                        variant="success"
                        size="sm"
                        disabled={decidingId === row.id}
                        onClick={() => handleDecide(row.id, 'approved')}
                      >
                        {t('leaveApprove')}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={decidingId === row.id}
                        onClick={() => handleDecide(row.id, 'rejected')}
                      >
                        {t('leaveReject')}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title={t('fieldBackdateAdminTitle')}
          description={t('fieldBackdateAdminHint')}
          action={
            backdates.length > 0 ? (
              <Button
                variant="success"
                size="sm"
                disabled={approvingAllBackdates || decidingBackdateId !== null}
                onClick={handleApproveAllBackdates}
              >
                {approvingAllBackdates
                  ? t('fieldBackdateApprovingAll')
                  : t('fieldBackdateApproveAll')}
              </Button>
            ) : null
          }
        >
          {loading ? (
            <Spinner />
          ) : backdates.length === 0 ? (
            <EmptyState title={t('fieldBackdateNoPending')} />
          ) : (
            <ul className="divide-y divide-black/[0.04]">
              {backdates.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-semibold text-apple-text">
                      {row.full_name}{' '}
                      <span className="font-normal text-apple-label">({row.employee_code})</span>
                    </div>
                    <p className="mt-1 text-apple-label">{row.reason}</p>
                    <div className="mt-2 space-y-1 text-xs text-apple-label">
                      <div>
                        {t('fieldBackdateFrom')}: {formatDisplayDate(row.from_valid_on)} →{' '}
                        {t('fieldBackdateTo')}: {formatDisplayDate(row.requested_valid_on)}
                      </div>
                      <div className="break-all font-mono">{row.checkout_code}</div>
                      <div>
                        {t('fieldDeliveryLineBonus', {
                          berat: row.berat_bersih,
                          bonus: formatIdr(row.bonus_amount),
                        })}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-apple-muted">
                      {t('correctionSubmittedAt')}: {formatDisplayDateTime(row.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="neutral">{t('leaveStatus_pending')}</Badge>
                    <Button
                      variant="success"
                      size="sm"
                      disabled={approvingAllBackdates || decidingBackdateId !== null}
                      onClick={() => handleBackdateDecide(row.id, 'approved')}
                    >
                      {t('leaveApprove')}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={approvingAllBackdates || decidingBackdateId !== null}
                      onClick={() => handleBackdateDecide(row.id, 'rejected')}
                    >
                      {t('leaveReject')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
