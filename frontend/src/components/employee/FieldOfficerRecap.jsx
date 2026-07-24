import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Field, StatTile, inputClass } from '../ui.jsx';
import { api, paths, ensureCsrf } from '../../api/client.js';
import { groupFieldDeliveriesByFactoryItem } from '../../utils/fieldCheckout.js';
import { formatIdr } from '../../utils/payrollDisplay.js';
import { currentPayrollPeriodKey, payrollCycleLabel } from '../../utils/payrollPeriod.js';
import { formatApiError } from '../../utils/employeeFormat.js';

function formatKg(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

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

  const factories = groupFieldDeliveriesByFactoryItem(report?.entries);

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

          {!factories.length ? (
            <p className="text-[15px] text-apple-label">{t('fieldMyRecapEmpty')}</p>
          ) : (
            <div className="max-h-[32rem] space-y-5 overflow-y-auto">
              {factories.map((factory) => (
                <section
                  key={factory.pabrik_code}
                  className="rounded-apple-lg border border-black/[0.06] bg-apple-fill/80"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/[0.06] px-3 py-2.5">
                    <h3 className="text-[15px] font-medium text-apple-text">
                      {factory.nama_pabrik
                        ? `${factory.pabrik_code} · ${factory.nama_pabrik}`
                        : factory.pabrik_code}
                    </h3>
                    <p className="text-[13px] text-apple-label">
                      {t('fieldMyRecapFactorySubtotal', {
                        kg: formatKg(factory.total_berat_bersih),
                        bonus: formatIdr(factory.total_bonus),
                      })}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[28rem] text-left text-sm">
                      <thead>
                        <tr className="text-[12px] uppercase tracking-wide text-apple-label">
                          <th className="px-3 py-2 font-medium">{t('fieldMyRecapItem')}</th>
                          <th className="px-3 py-2 font-medium">{t('fieldMyRecapDeliveries')}</th>
                          <th className="px-3 py-2 font-medium">
                            {t('fieldDelivery_berat_bersih')}
                          </th>
                          <th className="px-3 py-2 font-medium">{t('fieldMyRecapBonusCol')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.06]">
                        {factory.items.map((item) => (
                          <tr key={item.kode_barang}>
                            <td className="px-3 py-2 text-apple-text">
                              <span className="font-medium">{item.kode_barang}</span>
                              {item.nama_barang ? (
                                <span className="mt-0.5 block text-[13px] text-apple-label">
                                  {item.nama_barang}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-apple-text">
                              {item.delivery_count}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-apple-text">
                              {formatKg(item.total_berat_bersih)} kg
                            </td>
                            <td className="px-3 py-2 tabular-nums text-apple-text">
                              Rp {formatIdr(item.total_bonus)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-[15px] text-apple-label">{t('dashboardLoadFailed')}</p>
      )}
    </Card>
  );
}
