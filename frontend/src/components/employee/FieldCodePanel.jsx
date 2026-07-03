import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, inputClass } from '../ui.jsx';
import { api, paths, ensureCsrf } from '../../api/client.js';
import {
  isFieldCheckoutFormatValid,
  splitFieldCheckoutLines,
} from '../../utils/fieldCheckout.js';
import { formatIdr } from '../../utils/payrollDisplay.js';
import { formatApiError } from '../../utils/employeeFormat.js';

export default function FieldCodePanel({ summary, notify, onRefresh }) {
  const { t } = useTranslation();
  const [fieldCodeDraft, setFieldCodeDraft] = useState('');
  const [fieldCodeSubmitting, setFieldCodeSubmitting] = useState(false);
  const [todayDeliveries, setTodayDeliveries] = useState({ entries: [], today_bonus_total: 0 });

  const nextAction = summary?.next_clock_action ?? 'check_in';

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
            <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
              {todayDeliveries.entries.map((entry) => (
                <li key={entry.id} className="border-t border-black/[0.04] pt-2 font-mono">
                  <div className="break-all text-apple-text">{entry.checkout_code}</div>
                  <div className="mt-0.5 text-apple-label">
                    {t('fieldDeliveryLineBonus', {
                      berat: entry.berat_bersih,
                      bonus: formatIdr(entry.bonus_amount),
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Field>
    </div>
  );
}
