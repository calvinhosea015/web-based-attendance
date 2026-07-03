import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Field, inputClass, selectClass } from '../ui.jsx';
import LeaveDocumentButton from '../LeaveDocumentButton.jsx';
import { api, paths, ensureCsrf } from '../../api/client.js';
import { openLeaveDocument } from '../../utils/openLeaveDocument.js';
import { formatDateRange, formatDisplayDateTime } from '../../utils/formatDate.js';
import { formatApiError } from '../../utils/employeeFormat.js';

export default function LeavePanel({ notify }) {
  const { t } = useTranslation();
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: 'medical',
    start_date: '',
    end_date: '',
    reason: '',
  });
  const [leaveDocument, setLeaveDocument] = useState(null);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);

  const hasPendingLeave = leaveRequests.some((l) => l.approval_status === 'pending');
  const leaveNeedsDocument = leaveForm.leave_type === 'medical';

  const refreshLeave = async () => {
    try {
      const [lb, lr] = await Promise.all([
        api.get(paths.employeeLeaveBalances),
        api.get(paths.employeeLeaveRequests),
      ]);
      setLeaveBalances(lb.data || []);
      setLeaveRequests(lr.data || []);
    } catch {
      setLeaveBalances([]);
      setLeaveRequests([]);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        await ensureCsrf();
        await refreshLeave();
      } catch {
        /* ignore */
      }
    };
    load();
  }, []);

  const handleLeaveSubmit = async (e) => {
    e.preventDefault();
    if (leaveNeedsDocument && !leaveDocument) {
      notify(t('leaveDocumentRequired'));
      return;
    }
    setLeaveSubmitting(true);
    notify('');
    try {
      await ensureCsrf();
      const form = new FormData();
      form.append('leave_type', leaveForm.leave_type);
      form.append('start_date', leaveForm.start_date);
      form.append('end_date', leaveForm.end_date);
      if (leaveForm.reason) form.append('reason', leaveForm.reason);
      if (leaveDocument) form.append('document', leaveDocument);
      await api.post(paths.employeeLeaveRequests, form);
      setLeaveForm({ leave_type: 'medical', start_date: '', end_date: '', reason: '' });
      setLeaveDocument(null);
      notify(t('leaveSubmitted'), 'success');
      await refreshLeave();
    } catch (err) {
      notify(formatApiError(err));
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const openLeaveAttachment = async (requestId) => {
    if (!requestId) return;
    try {
      await openLeaveDocument(api, paths.leaveRequestAttachment(requestId), {
        title: t('leaveDocumentPreviewTitle'),
        closeLabel: t('close'),
        downloadLabel: t('download'),
      });
    } catch (err) {
      notify(err.message ? err.message : formatApiError(err));
    }
  };

  return (
    <Card title={t('leaveTitle')} description={t('leaveEmployeeHint')}>
      {leaveBalances.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {leaveBalances.map((b) => (
            <div
              key={b.leave_type}
              className="rounded-apple-lg border border-black/[0.06] bg-apple-fill/60 px-4 py-3 text-sm"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-apple-label">
                {t(`leaveType_${b.leave_type}`)}
              </p>
              <p className="mt-1 text-[22px] font-semibold tracking-tightest text-apple-text">
                {b.remaining_days} / {b.quota_days} {t('leaveDaysUnit')}
              </p>
              <p className="text-xs text-apple-label">{t('leaveBalanceRemaining')}</p>
            </div>
          ))}
        </div>
      )}
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleLeaveSubmit}>
        <Field label={t('leaveType')}>
          <select
            className={selectClass}
            value={leaveForm.leave_type}
            onChange={(e) => {
              setLeaveForm((f) => ({ ...f, leave_type: e.target.value }));
              if (e.target.value !== 'medical') setLeaveDocument(null);
            }}
            disabled={hasPendingLeave}
          >
            <option value="medical">{t('leaveType_medical')}</option>
            <option value="unpaid">{t('leaveType_unpaid')}</option>
            <option value="paternity">{t('leaveType_paternity')}</option>
          </select>
        </Field>
        <Field label={t('leaveStartDate')}>
          <input
            type="date"
            required
            className={inputClass}
            value={leaveForm.start_date}
            onChange={(e) => setLeaveForm((f) => ({ ...f, start_date: e.target.value }))}
            disabled={hasPendingLeave}
          />
        </Field>
        <Field label={t('leaveEndDate')}>
          <input
            type="date"
            required
            className={inputClass}
            value={leaveForm.end_date}
            min={leaveForm.start_date || undefined}
            onChange={(e) => setLeaveForm((f) => ({ ...f, end_date: e.target.value }))}
            disabled={hasPendingLeave}
          />
        </Field>
        {leaveNeedsDocument && (
          <Field label={t('leaveDocument')} hint={t('leaveDocumentHint')}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              required
              className={inputClass}
              onChange={(e) => setLeaveDocument(e.target.files?.[0] || null)}
              disabled={hasPendingLeave}
            />
          </Field>
        )}
        <Field label={t('leaveReason')} className="sm:col-span-2">
          <textarea
            className={`${inputClass} min-h-[72px]`}
            value={leaveForm.reason}
            onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
            disabled={hasPendingLeave}
            maxLength={2000}
          />
        </Field>
        <div className="sm:col-span-2">
          {hasPendingLeave && (
            <p className="mb-3 text-sm text-amber-800">{t('leavePendingExists')}</p>
          )}
          <Button type="submit" variant="primary" disabled={leaveSubmitting || hasPendingLeave}>
            {leaveSubmitting ? t('loading') : t('leaveSubmit')}
          </Button>
        </div>
      </form>
      {leaveRequests.length > 0 && (
        <ul className="mt-6 space-y-4 border-t border-black/[0.04] pt-6">
          {leaveRequests.map((req) => (
            <li
              key={req.id}
              className="rounded-apple-lg border border-black/[0.06] bg-apple-fill/50 px-4 py-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-apple-text">
                    {t(`leaveType_${req.leave_type}`)}
                  </span>
                  <span className="ml-2 text-apple-label">
                    {formatDateRange(req.start_date, req.end_date)} · {req.days_count}{' '}
                    {t('leaveDaysUnit')}
                  </span>
                </div>
                <Badge
                  variant={
                    req.approval_status === 'approved'
                      ? 'success'
                      : req.approval_status === 'rejected'
                        ? 'muted'
                        : 'neutral'
                  }
                >
                  {t(`leaveStatus_${req.approval_status}`)}
                </Badge>
              </div>
              {req.reason && <p className="mt-1 text-xs text-apple-label">{req.reason}</p>}
              {req.approval_status === 'approved' && (
                <p className="mt-1 text-xs text-apple-label">
                  {t('leavePayStatus')}: {req.is_paid ? t('leavePaid') : t('leaveUnpaid')}
                </p>
              )}
              {req.approval_status === 'pending' && req.leave_type === 'medical' && (
                <p className="mt-1 text-xs text-apple-label">{t('leaveMedicalPaidHint')}</p>
              )}
              {req.approval_status === 'pending' && req.leave_type === 'unpaid' && (
                <p className="mt-1 text-xs text-apple-label">{t('leaveUnpaidHint')}</p>
              )}
              <p className="mt-1 text-xs text-apple-label">
                {t('leaveSubmittedAt')}: {formatDisplayDateTime(req.created_at)}
              </p>
              {req.attachment_path && (
                <LeaveDocumentButton onClick={() => openLeaveAttachment(req.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
