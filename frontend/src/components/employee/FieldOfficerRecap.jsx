import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Field, StatTile, inputClass } from '../ui.jsx';
import { api, paths, ensureCsrf } from '../../api/client.js';
import { fieldDeliveryDisplayFields } from '../../utils/fieldCheckout.js';
import { formatDisplayDate } from '../../utils/formatDate.js';
import { formatIdr } from '../../utils/payrollDisplay.js';
import { currentPayrollPeriodKey, payrollCycleLabel } from '../../utils/payrollPeriod.js';
import { formatApiError } from '../../utils/employeeFormat.js';

export default function FieldOfficerRecap({ notify }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState(currentPayrollPeriodKey());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await ensureCsrf();
      const { data } = await api.get(paths.employeeFieldDeliveriesPeriod(period));
      setReport(data);
    } catch (err) {
      setReport(null);
      // ponytail: parent notify is unstable; period is the real dependency
      notify?.(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps -- notify from parent is inline

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card
      title={t('fieldMyRecapTitle')}
      description={
        report?.period_start && report?.period_end
          ? `${t('fieldMyRecapHint')} · ${payrollCycleLabel(period)}`
          : t('fieldMyRecapHint')
      }
      action={
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t('payrollMonth')}>
            <input
              type="month"
              className={inputClass}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </Field>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={load}
          >
            {loading ? t('loading') : t('fieldOmsetRefresh')}
          </Button>
        </div>
      }
    >
      {loading && !report ? (
        <p className="text-[15px] text-apple-label">{t('loading')}</p>
      ) : report ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile
              label={t('fieldMyRecapBonusTotal')}
              value={`Rp ${formatIdr(report.bonus_total)}`}
              sub={t('fieldMyRecapBonusHint', { count: report.delivery_count })}
            />
            <StatTile
              label={t('fieldOmsetTotal')}
              value={`Rp ${formatIdr(report.omset_total)}`}
              sub={t('fieldOmsetFromCodesHint')}
            />
          </div>

          {!report.entries?.length ? (
            <p className="text-[15px] text-apple-label">{t('fieldMyRecapEmpty')}</p>
          ) : (
            <ul className="max-h-[28rem] space-y-3 overflow-y-auto">
              {report.entries.map((row) => {
                const parsed = fieldDeliveryDisplayFields(row);
                return (
                  <li
                    key={row.id}
                    className="rounded-apple-lg border border-black/[0.06] bg-apple-fill/80 p-3 text-sm"
                  >
                    <div className="text-apple-label">
                      {t('fieldDeliveryDate')}: {formatDisplayDate(row.valid_on)}
                    </div>
                    {row.checkout_code ? (
                      <p className="mt-1 break-all font-mono text-xs text-apple-text">
                        {row.checkout_code}
                      </p>
                    ) : null}
                    {parsed ? (
                      <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                        {Object.entries(parsed).map(([key, value]) => (
                          <div key={key}>
                            <dt className="text-xs uppercase tracking-wide text-apple-label">
                              {t(`fieldDelivery_${key}`, key)}
                            </dt>
                            <dd className="font-medium text-apple-text">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    <p className="mt-2 text-apple-label">
                      {t('fieldOmsetLineAmounts', {
                        omset: formatIdr(row.omset_amount),
                        bonus: formatIdr(row.bonus_amount),
                      })}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-[15px] text-apple-label">{t('dashboardLoadFailed')}</p>
      )}
    </Card>
  );
}
