import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Card, EmptyState, Field, inputClass } from '../ui.jsx';
import { api, paths, ensureCsrf } from '../../api/client.js';
import { translateApiMessage, translateAttendanceStatus } from '../../translateApi.js';
import { formatDisplayDateTime } from '../../utils/formatDate.js';
import {
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../../utils/employeeFormat.js';

export default function EmployeeHistorySection({ history, isUmum, onCorrectionSubmitted }) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm] = useState({ reason: '', check_in: '', check_out: '' });

  const openForm = useCallback((item) => {
    setExpandedId(item.id);
    setForm({
      reason: '',
      check_in: toDateTimeLocalValue(item.check_in),
      check_out: toDateTimeLocalValue(item.check_out),
    });
    setMessage('');
  }, []);

  const submitCorrection = async (attendanceId) => {
    setSubmitting(true);
    setMessage('');
    try {
      await ensureCsrf();
      const body = {
        attendance_id: attendanceId,
        reason: form.reason.trim(),
      };
      const checkIn = fromDateTimeLocalValue(form.check_in);
      const checkOut = fromDateTimeLocalValue(form.check_out);
      if (checkIn) body.check_in = checkIn;
      if (form.check_out !== '') body.check_out = checkOut;
      await api.post(paths.employeeAttendanceCorrections, body);
      setMessage(t('correctionSubmitted'));
      setExpandedId(null);
      onCorrectionSubmitted?.();
    } catch (err) {
      setMessage(translateApiMessage(err) || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card title={t('history')}>
      {message && (
        <Alert tone={message.includes(t('correctionSubmitted')) ? 'success' : 'error'}>
          {message}
        </Alert>
      )}
      {history.length ? (
        <ul className={`space-y-3 text-[15px] ${message ? 'mt-4' : ''}`}>
          {history.map((item) => (
            <li key={item.id} className="rounded-apple-lg border border-black/[0.04] bg-apple-fill/80 px-4 py-3">
              <div className="font-medium text-apple-text">{item.office_name}</div>
              <div className="text-apple-label">
                {t('status')}: {translateAttendanceStatus(item.attendance_status)}
              </div>
              <div className="text-apple-label">
                {t('checkIn')}: {item.check_in ? formatDisplayDateTime(item.check_in) : ''}
              </div>
              {!isUmum && (
                <div className="text-apple-label">
                  {t('checkOut')}: {item.check_out ? formatDisplayDateTime(item.check_out) : t('notCheckedOut')}
                </div>
              )}
              {item.pending_correction === true || item.pending_correction === 't' ? (
                <div className="mt-2">
                  <Badge variant="warning">{t('correctionPending')}</Badge>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => openForm(item)}
                >
                  {expandedId === item.id ? t('correctionCancel') : t('correctionRequest')}
                </Button>
              )}
              {expandedId === item.id && (
                <div className="mt-3 space-y-3 rounded-apple-lg border border-black/[0.06] bg-white p-4">
                  <Field label={t('correctionReason')}>
                    <textarea
                      className={`${inputClass} min-h-[72px]`}
                      value={form.reason}
                      onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                    />
                  </Field>
                  <Field label={t('checkIn')}>
                    <input
                      type="datetime-local"
                      className={inputClass}
                      value={form.check_in}
                      onChange={(e) => setForm((f) => ({ ...f, check_in: e.target.value }))}
                    />
                  </Field>
                  {!isUmum && (
                    <Field label={t('checkOut')}>
                      <input
                        type="datetime-local"
                        className={inputClass}
                        value={form.check_out}
                        onChange={(e) => setForm((f) => ({ ...f, check_out: e.target.value }))}
                      />
                    </Field>
                  )}
                  <Button
                    size="sm"
                    disabled={submitting || !form.reason.trim()}
                    onClick={() => submitCorrection(item.id)}
                  >
                    {submitting ? t('submitting') : t('correctionSubmit')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t('noHistory')} />
      )}
    </Card>
  );
}
