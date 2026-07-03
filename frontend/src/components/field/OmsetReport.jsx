import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, Field, StatTile, inputClass } from '../ui.jsx';
import { api, paths } from '../../api/client.js';
import { translateApiMessage } from '../../translateApi.js';
import { useNotify } from '../../hooks/useNotify.js';
import { currentPayrollPeriodKey, payrollCycleLabel } from '../../utils/payrollPeriod.js';
import { formatIdr } from '../../utils/payrollDisplay.js';

/**
 * @param {{ period?: string, onPeriodChange?: (p: string) => void }} props
 */
export default function OmsetReport({ period: periodProp, onPeriodChange }) {
  const { t } = useTranslation();
  const [notification, notify, dismiss] = useNotify();
  const omsetPeriod = periodProp ?? currentPayrollPeriodKey();

  const [report, setReport] = useState(null);
  const [omsetLoading, setOmsetLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const loadReport = useCallback(async () => {
    setOmsetLoading(true);
    try {
      const res = await api.get(paths.financeFieldOmset(omsetPeriod));
      setReport(res.data);
    } catch (err) {
      setReport(null);
      notify(translateApiMessage(err) || t('dashboardLoadFailed'), 'error');
    } finally {
      setOmsetLoading(false);
    }
  }, [omsetPeriod, t, notify]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  return (
    <section id="field-omset" className="scroll-mt-24">
      {notification && (
        <Alert tone={notification.tone} onDismiss={dismiss}>
          {notification.text}
        </Alert>
      )}
      <Card
        title={t('fieldOmsetReportTitle')}
        description={
          report?.period_start && report?.period_end
            ? `${t('fieldOmsetReportSubtitle')} · ${payrollCycleLabel(omsetPeriod)}`
            : t('fieldOmsetReportSubtitle')
        }
        action={
          onPeriodChange ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field label={t('payrollMonth')}>
                <input
                  type="month"
                  className={inputClass}
                  value={omsetPeriod}
                  onChange={(e) => onPeriodChange(e.target.value)}
                />
              </Field>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={omsetLoading}
                onClick={() => {
                  dismiss();
                  loadReport();
                }}
              >
                {omsetLoading ? t('loading') : t('fieldOmsetRefresh')}
              </Button>
            </div>
          ) : null
        }
      >
        {omsetLoading && !report ? (
          <p className="text-[15px] text-apple-label">{t('loading')}</p>
        ) : report ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile
                label={t('fieldOmsetTotal')}
                value={`Rp ${formatIdr(report.total_omset)}`}
                sub={t('fieldOmsetFromCodesHint')}
              />
              <StatTile
                label={t('fieldOmsetBonusTotal')}
                value={`Rp ${formatIdr(report.total_bonus)}`}
                sub={t('fieldOmsetBonusHint', { count: report.delivery_count })}
              />
              <StatTile
                label={t('fieldOmsetDeliveries')}
                value={report.delivery_count}
                sub={t('fieldOmsetOfficerCountHint', { count: report.employees.length })}
              />
            </div>
            {!report.employees?.length ? (
              <p className="text-[15px] text-apple-label">{t('fieldOmsetNoOfficers')}</p>
            ) : (
              <div className="space-y-5">
                {report.delivery_count === 0 ? (
                  <p className="text-[15px] text-apple-label">{t('fieldOmsetEmpty')}</p>
                ) : null}
                <div className="space-y-3">
                  {report.employees.map((emp) => (
                    <div
                      key={emp.employee_id}
                      className="rounded-apple-lg border border-black/[0.06] bg-white p-5 shadow-apple"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-apple-text">{emp.full_name}</div>
                          <div className="text-[13px] text-apple-label">{emp.employee_code}</div>
                        </div>
                        <div className="grid gap-3 text-right sm:grid-cols-3 sm:gap-6">
                          <div>
                            <div className="text-[12px] font-medium text-apple-label">
                              {t('fieldOmsetDeliveries')}
                            </div>
                            <div className="mt-1 tabular-nums text-[15px] font-medium text-apple-text">
                              {emp.delivery_count}
                            </div>
                          </div>
                          <div>
                            <div className="text-[12px] font-medium text-apple-label">
                              {t('fieldOmsetTotal')}
                            </div>
                            <div className="mt-1 tabular-nums text-[15px] font-medium text-apple-text">
                              Rp {formatIdr(emp.omset_total)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[12px] font-medium text-apple-label">
                              {t('fieldOmsetBonusTotal')}
                            </div>
                            <div className="mt-1 tabular-nums text-[15px] font-medium text-brand-600">
                              Rp {formatIdr(emp.bonus_total)}
                            </div>
                          </div>
                        </div>
                      </div>
                      {emp.deliveries.length > 0 ? (
                        <div className="mt-4 border-t border-black/[0.06] pt-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setExpandedId((id) =>
                                id === emp.employee_id ? null : emp.employee_id
                              )
                            }
                          >
                            {expandedId === emp.employee_id
                              ? t('fieldOmsetHideLines')
                              : t('fieldOmsetShowLines')}
                          </Button>
                          {expandedId === emp.employee_id ? (
                            <ul className="mt-3 space-y-2 text-[13px] text-apple-label">
                              {emp.deliveries.map((d) => (
                                <li
                                  key={d.id}
                                  className="rounded-apple border border-apple-border bg-apple-highlight px-4 py-3"
                                >
                                  <div className="flex flex-wrap justify-between gap-2">
                                    <span className="font-medium text-apple-text">
                                      {d.valid_on} · {d.pabrik_code} · {d.kode_barang}
                                    </span>
                                    <span>
                                      {t('fieldOmsetLineAmounts', {
                                        omset: formatIdr(d.omset_amount),
                                        bonus: formatIdr(d.bonus_amount),
                                      })}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-apple-muted">
                                    {t('fieldDelivery_berat_bersih')}: {d.berat_bersih} kg ·{' '}
                                    {t('pabrikItemTonase')}: {d.tonase_per_item}
                                    {Number(d.price_per_item) > 0
                                      ? ` · ${t('pabrikItemPrice')}: Rp ${formatIdr(d.price_per_item)}`
                                      : ''}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-4 border-t border-black/[0.06] pt-4 text-[13px] text-apple-label">
                          {t('fieldOmsetOfficerNoDeliveries')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[15px] text-apple-label">{t('fieldOmsetEmpty')}</p>
        )}
      </Card>
    </section>
  );
}
