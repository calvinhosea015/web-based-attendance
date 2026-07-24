import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, Field, StatTile, inputClass } from '../ui.jsx';
import { api, paths, downloadBlobResponse } from '../../api/client.js';
import { translateApiMessage } from '../../translateApi.js';
import { useNotify } from '../../hooks/useNotify.js';
import {
  currentPayrollPeriodKey,
  payrollCycleBounds,
} from '../../utils/payrollPeriod.js';
import { formatIdr } from '../../utils/payrollDisplay.js';
import { uniqueDeliveryFilterValues } from '../../utils/fieldCheckout.js';

function formatKg(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

function factoryLabel(row) {
  const code = String(row.pabrik_code ?? '').trim();
  const name = String(row.nama_pabrik ?? '').trim();
  return name ? `${code} · ${name}` : code;
}

export default function FactoryItemBonusReport() {
  const { t } = useTranslation();
  const [notification, notify, dismiss] = useNotify();

  const defaults = () => {
    const bounds = payrollCycleBounds(currentPayrollPeriodKey());
    return {
      from: bounds?.period_start || '',
      to: bounds?.period_end || '',
    };
  };

  const [dateFrom, setDateFrom] = useState(() => defaults().from);
  const [dateTo, setDateTo] = useState(() => defaults().to);
  const [pabrik, setPabrik] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setLoading(true);
    try {
      const { data } = await api.get(paths.adminFieldDeliveriesSummary, {
        params: { from: dateFrom, to: dateTo },
      });
      setReport(data);
    } catch (err) {
      setReport(null);
      notify(translateApiMessage(err) || t('dashboardLoadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, notify, t]);

  useEffect(() => {
    load();
  }, [load]);

  const factoryOptions = useMemo(() => {
    const codes = uniqueDeliveryFilterValues(report?.rows, 'pabrik_code');
    const nameByCode = new Map();
    for (const row of report?.rows || []) {
      const code = String(row.pabrik_code ?? '').trim();
      if (code && !nameByCode.has(code) && row.nama_pabrik) {
        nameByCode.set(code, String(row.nama_pabrik).trim());
      }
    }
    return codes.map((code) => ({
      code,
      label: nameByCode.get(code) ? `${code} · ${nameByCode.get(code)}` : code,
    }));
  }, [report]);

  const filteredRows = useMemo(() => {
    const code = String(pabrik || '').trim();
    if (!code) return report?.rows || [];
    return (report?.rows || []).filter((row) => String(row.pabrik_code ?? '').trim() === code);
  }, [report, pabrik]);

  const filteredTotals = useMemo(() => {
    let delivery_count = 0;
    let total_berat_bersih = 0;
    let total_omset = 0;
    let total_bonus = 0;
    for (const row of filteredRows) {
      delivery_count += Number(row.delivery_count) || 0;
      total_berat_bersih += Number(row.total_berat_bersih) || 0;
      total_omset += Number(row.total_omset) || 0;
      total_bonus += Number(row.total_bonus) || 0;
    }
    return {
      delivery_count,
      total_berat_bersih: Math.round(total_berat_bersih * 100) / 100,
      total_omset: Math.round(total_omset * 100) / 100,
      total_bonus: Math.round(total_bonus * 100) / 100,
    };
  }, [filteredRows]);

  const handleExport = async () => {
    if (!dateFrom || !dateTo) return;
    setExporting(true);
    dismiss();
    try {
      const params = { from: dateFrom, to: dateTo };
      if (pabrik) params.pabrik_code = pabrik;
      const res = await api.get(paths.adminFieldTonaseBonusExport, {
        params,
        responseType: 'blob',
      });
      const suffix = pabrik ? `_${pabrik}` : '';
      downloadBlobResponse(res, `tonase_bonus_${dateFrom}_${dateTo}${suffix}.xlsx`);
      notify(t('fieldFactoryBonusExported'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section id="factory-item-bonus" className="scroll-mt-24">
      {notification && (
        <Alert tone={notification.tone} onDismiss={dismiss}>
          {notification.text}
        </Alert>
      )}
      <Card
        title={t('fieldFactoryBonusReportTitle')}
        description={t('fieldFactoryBonusReportHint')}
        action={
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('pabrikTonaseDateFrom')}>
              <input
                type="date"
                className={inputClass}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </Field>
            <Field label={t('pabrikTonaseDateTo')}>
              <input
                type="date"
                className={inputClass}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </Field>
            <Field label={t('fieldFactoryBonusFilterPabrik')} className="min-w-[10rem]">
              <select
                className={inputClass}
                value={pabrik}
                onChange={(e) => setPabrik(e.target.value)}
              >
                <option value="">{t('pabrikTonaseFilterAll')}</option>
                {factoryOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={loading || !dateFrom || !dateTo}
              onClick={() => {
                dismiss();
                load();
              }}
            >
              {loading ? t('loading') : t('fieldOmsetRefresh')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={exporting || !dateFrom || !dateTo}
              onClick={handleExport}
            >
              {exporting ? t('loading') : t('fieldFactoryBonusDownload')}
            </Button>
          </div>
        }
      >
        {loading && !report ? (
          <p className="text-[15px] text-apple-label">{t('loading')}</p>
        ) : report ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile
                label={t('fieldFactoryBonusNetTotal')}
                value={`${formatKg(filteredTotals.total_berat_bersih)} kg`}
                sub={t('fieldFactoryBonusNetHint')}
              />
              <StatTile
                label={t('fieldMyRecapBonusTotal')}
                value={`Rp ${formatIdr(filteredTotals.total_bonus)}`}
                sub={t('fieldMyRecapBonusHint', { count: filteredTotals.delivery_count })}
              />
              <StatTile
                label={t('fieldOmsetTotal')}
                value={`Rp ${formatIdr(filteredTotals.total_omset)}`}
                sub={t('fieldOmsetFromCodesHint')}
              />
            </div>

            {!filteredRows.length ? (
              <p className="text-[15px] text-apple-label">
                {report.rows?.length
                  ? t('fieldFactoryBonusFilterNoMatch')
                  : t('fieldFactoryBonusEmpty')}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-apple-lg border border-black/[0.06]">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="bg-apple-fill/80">
                    <tr className="text-[12px] uppercase tracking-wide text-apple-label">
                      <th className="px-3 py-2.5 font-medium">
                        {t('fieldDeliveryRecapFilterPabrik')}
                      </th>
                      <th className="px-3 py-2.5 font-medium">{t('fieldMyRecapItem')}</th>
                      <th className="px-3 py-2.5 font-medium">{t('fieldMyRecapDeliveries')}</th>
                      <th className="px-3 py-2.5 font-medium">
                        {t('fieldDelivery_berat_bersih')}
                      </th>
                      <th className="px-3 py-2.5 font-medium">{t('fieldOmsetTotal')}</th>
                      <th className="px-3 py-2.5 font-medium">{t('fieldMyRecapBonusCol')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {filteredRows.map((row) => (
                      <tr key={`${row.pabrik_code}-${row.kode_barang}`}>
                        <td className="px-3 py-2 text-apple-text">{factoryLabel(row)}</td>
                        <td className="px-3 py-2 text-apple-text">
                          <span className="font-medium">{row.kode_barang}</span>
                          {row.nama_barang ? (
                            <span className="mt-0.5 block text-[13px] text-apple-label">
                              {row.nama_barang}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-apple-text">
                          {row.delivery_count}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-apple-text">
                          {formatKg(row.total_berat_bersih)} kg
                        </td>
                        <td className="px-3 py-2 tabular-nums text-apple-text">
                          Rp {formatIdr(row.total_omset)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-apple-text">
                          Rp {formatIdr(row.total_bonus)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[15px] text-apple-label">{t('dashboardLoadFailed')}</p>
        )}
      </Card>
    </section>
  );
}
