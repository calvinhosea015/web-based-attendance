import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Field, inputClass } from '../ui.jsx';
import { api, paths, ensureCsrf } from '../../api/client.js';
import {
  isFieldCheckoutFormatValid,
  splitFieldCheckoutLines,
} from '../../utils/fieldCheckout.js';
import { formatIdr } from '../../utils/payrollDisplay.js';
import { formatApiError } from '../../utils/employeeFormat.js';

function ymdDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function FieldCodePanel({ summary, notify, onRefresh }) {
  const { t } = useTranslation();
  const [fieldCodeDraft, setFieldCodeDraft] = useState('');
  const [fieldCodeSubmitting, setFieldCodeSubmitting] = useState(false);
  const [todayDeliveries, setTodayDeliveries] = useState({ entries: [], today_bonus_total: 0 });
  const [backdateForId, setBackdateForId] = useState(null);
  const [backdateDate, setBackdateDate] = useState('');
  const [backdateReason, setBackdateReason] = useState('');
  const [backdateSubmitting, setBackdateSubmitting] = useState(false);

  const nextAction = summary?.next_clock_action ?? 'check_in';
  const minBackdate = ymdDaysAgo(7);
  const maxBackdate = ymdDaysAgo(1);

  const loadTodayDeliveries = async () => {
    try {
      const { data } = await api.get(paths.employeeFieldDeliveriesToday);
      setTodayDeliveries({
        entries: data?.entries || [],
        today_bonus_total: Number(data?.today_bonus_total || 0),
      });
    } catch {
      setTodayDeliveries({ entries: [], today_bonus_total: 0 });
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        await ensureCsrf();
        await loadTodayDeliveries();
      } catch {
        /* ignore */
      }
    };
    load();
  }, []);

  const handleSubmitFieldCode = async () => {
    const lines = splitFieldCheckoutLines(fieldCodeDraft);
    if (!lines.length) {
      notify(t('checkoutCodeRequired'));
      return;
    }
    const invalid = lines.find((line) => !isFieldCheckoutFormatValid(line));
    if (invalid) {
      notify(t('checkoutCodeInvalidFormat'));
      return;
    }
    notify('');
    setFieldCodeSubmitting(true);
    try {
      await ensureCsrf();
      const { data } = await api.post(paths.employeeFieldCode, { code: fieldCodeDraft.trim() });
      const count = data?.count ?? lines.length;
      notify(
        count > 1
          ? t('fieldCodesAccepted', { count, bonus: formatIdr(data?.today_bonus_total) })
          : t('fieldCodeAcceptedBonus', { bonus: formatIdr(data?.today_bonus_total) }),
        'success'
      );
      setFieldCodeDraft('');
      await Promise.all([onRefresh(), loadTodayDeliveries()]);
    } catch (err) {
      notify(formatApiError(err));
    } finally {
      setFieldCodeSubmitting(false);
    }
  };

  const openBackdate = (entryId) => {
    setBackdateForId(entryId);
    setBackdateDate(maxBackdate);
    setBackdateReason('');
  };

  const cancelBackdate = () => {
    setBackdateForId(null);
    setBackdateDate('');
    setBackdateReason('');
  };

  const submitBackdate = async (entryId) => {
    if (!backdateDate || !backdateReason.trim()) {
      notify(t('fieldBackdateNeedFields'));
      return;
    }
    setBackdateSubmitting(true);
    notify('');
    try {
      await ensureCsrf();
      await api.post(paths.employeeFieldDeliveryBackdate(entryId), {
        requested_valid_on: backdateDate,
        reason: backdateReason.trim(),
      });
      notify(t('fieldBackdateSubmitted'), 'success');
      cancelBackdate();
      await loadTodayDeliveries();
    } catch (err) {
      notify(formatApiError(err));
    } finally {
      setBackdateSubmitting(false);
    }
  };

  return (
    <div className="border-t border-black/[0.06] pt-6">
      <Field
        label={t('fieldCheckoutCode')}
        hint={
          nextAction === 'check_in' ? t('fieldCodeCheckInFirst') : t('fieldCodeSubmitHint')
        }
      >
        <textarea
          className={`${inputClass} min-h-[4.5rem] font-mono text-xs`}
          value={fieldCodeDraft}
          onChange={(e) => setFieldCodeDraft(e.target.value)}
          autoComplete="off"
          placeholder={t('fieldCheckoutCodePlaceholder')}
          disabled={nextAction === 'check_in'}
        />
        <Button
          type="button"
          variant="primary"
          className="mt-3 w-full sm:w-auto"
          disabled={
            nextAction === 'check_in' ||
            fieldCodeSubmitting ||
            !splitFieldCheckoutLines(fieldCodeDraft).every((line) =>
              isFieldCheckoutFormatValid(line)
            ) ||
            !splitFieldCheckoutLines(fieldCodeDraft).length
          }
          onClick={handleSubmitFieldCode}
        >
          {fieldCodeSubmitting ? t('loading') : t('submitFieldCode')}
        </Button>
        {todayDeliveries.entries.length > 0 && (
          <div className="mt-4 rounded-apple-lg border border-black/[0.06] bg-apple-fill/80 p-3 text-xs">
            <p className="font-medium text-apple-text">
              {t('fieldDeliveryTodayTotal', {
                count: todayDeliveries.entries.length,
                bonus: formatIdr(todayDeliveries.today_bonus_total),
              })}
            </p>
            <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto">
              {todayDeliveries.entries.map((entry) => (
                <li key={entry.id} className="border-t border-black/[0.04] pt-2">
                  <div className="break-all font-mono text-apple-text">{entry.checkout_code}</div>
                  <div className="mt-0.5 text-apple-label">
                    {t('fieldDeliveryLineBonus', {
                      berat: entry.berat_bersih,
                      bonus: formatIdr(entry.bonus_amount),
                    })}
                  </div>
                  {entry.pending_backdate ? (
                    <div className="mt-2">
                      <Badge variant="warning">{t('fieldBackdatePending')}</Badge>
                    </div>
                  ) : backdateForId === entry.id ? (
                    <div className="mt-2 space-y-2 rounded-apple border border-black/[0.06] bg-white/70 p-2">
                      <p className="text-apple-label">{t('fieldBackdateHint')}</p>
                      <Field label={t('fieldBackdateDate')}>
                        <input
                          type="date"
                          className={inputClass}
                          min={minBackdate}
                          max={maxBackdate}
                          value={backdateDate}
                          onChange={(e) => setBackdateDate(e.target.value)}
                        />
                      </Field>
                      <Field label={t('fieldBackdateReason')}>
                        <textarea
                          className={`${inputClass} min-h-[3rem]`}
                          value={backdateReason}
                          onChange={(e) => setBackdateReason(e.target.value)}
                          maxLength={2000}
                        />
                      </Field>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={backdateSubmitting}
                          onClick={() => submitBackdate(entry.id)}
                        >
                          {backdateSubmitting ? t('loading') : t('fieldBackdateSubmit')}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={backdateSubmitting}
                          onClick={cancelBackdate}
                        >
                          {t('cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      onClick={() => openBackdate(entry.id)}
                    >
                      {t('fieldBackdateRequest')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Field>
    </div>
  );
}
