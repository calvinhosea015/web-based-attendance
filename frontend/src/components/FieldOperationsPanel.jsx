import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, Field, StatTile, inputClass } from './ui.jsx';
import { api, paths, ensureCsrf } from '../api/client.js';
import { translateApiMessage } from '../translateApi.js';
import {
  currentPayrollPeriodKey,
  payrollCycleLabel,
  periodLabelCalendar,
} from '../utils/payrollPeriod.js';

function formatIdr(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

/**
 * @param {{ period: string, onPeriodChange: (p: string) => void, showOmset?: boolean, showPabrik?: boolean, showTonase?: boolean }} props
 */
export default function FieldOperationsPanel({
  period,
  onPeriodChange,
  showOmset = true,
  showPabrik = true,
  showTonase = true,
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');

  const [pabriks, setPabriks] = useState([]);
  const [pabrikRates, setPabrikRates] = useState([]);
  const [pabrikMapsDraft, setPabrikMapsDraft] = useState({});
  const [pabrikMapsSavingId, setPabrikMapsSavingId] = useState(null);
  const [expandedPabrikCode, setExpandedPabrikCode] = useState(null);
  const [pabrikForm, setPabrikForm] = useState({
    pabrik_code: '',
    kode_barang: '',
    tonase_per_item: '',
  });
  const [pabrikSaving, setPabrikSaving] = useState(false);
  const [pabrikLoading, setPabrikLoading] = useState(false);

  const [report, setReport] = useState(null);
  const [omsetLoading, setOmsetLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const notify = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const loadPabriks = useCallback(async () => {
    if (!showPabrik && !showTonase) return;
    setPabrikLoading(true);
    try {
      const { data } = await api.get(paths.adminPabriks);
      const list = Array.isArray(data?.pabriks) ? data.pabriks : [];
      setPabriks(list);
      setPabrikMapsDraft(
        Object.fromEntries(list.map((p) => [p.id, p.google_maps_url || '']))
      );
      setPabrikRates(
        list.flatMap((p) =>
          (p.items || []).map((item) => ({
            ...item,
            pabrik_code: p.pabrik_code,
            nama_pabrik: p.nama_pabrik,
          }))
        )
      );
    } catch (err) {
      setPabriks([]);
      setPabrikRates([]);
      setPabrikMapsDraft({});
      notify(translateApiMessage(err) || t('dashboardLoadFailed'), 'error');
    } finally {
      setPabrikLoading(false);
    }
  }, [showPabrik, showTonase, t]);

  const loadReport = useCallback(async () => {
    if (!showOmset) return;
    setOmsetLoading(true);
    try {
      const res = await api.get(paths.financeFieldOmset(period));
      setReport(res.data);
    } catch (err) {
      setReport(null);
      notify(translateApiMessage(err) || t('dashboardLoadFailed'), 'error');
    } finally {
      setOmsetLoading(false);
    }
  }, [period, showOmset, t]);

  const refreshAll = useCallback(async () => {
    notify('');
    await Promise.all([loadPabriks(), loadReport()]);
  }, [loadPabriks, loadReport]);

  useEffect(() => {
    loadPabriks();
  }, [loadPabriks]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const pabrikItemOptions = useMemo(() => {
    const pabrik = pabriks.find((p) => p.pabrik_code === pabrikForm.pabrik_code);
    return (pabrik?.items || []).map((item) => item.kode_barang);
  }, [pabriks, pabrikForm.pabrik_code]);

  const handleSavePabrikMaps = async (pabrikId) => {
    setPabrikMapsSavingId(pabrikId);
    notify('');
    try {
      await ensureCsrf();
      await api.put(paths.adminPabrik(pabrikId), {
        google_maps_url: pabrikMapsDraft[pabrikId] || null,
      });
      await loadPabriks();
      notify(t('pabrikMapsSaved'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setPabrikMapsSavingId(null);
    }
  };

  const handleSavePabrikRate = async (e) => {
    e.preventDefault();
    setPabrikSaving(true);
    notify('');
    try {
      await ensureCsrf();
      const payload = {
        pabrik_code: pabrikForm.pabrik_code.trim(),
        kode_barang: pabrikForm.kode_barang.trim(),
        tonase_per_item: Number(pabrikForm.tonase_per_item) || 0,
      };
      const existing = pabrikRates.find(
        (r) =>
          r.pabrik_code === payload.pabrik_code &&
          r.kode_barang.toUpperCase() === payload.kode_barang.toUpperCase()
      );
      if (existing?.id) {
        await api.put(`${paths.adminPabrikItemRates}/${existing.id}`, payload);
      } else {
        await api.post(paths.adminPabrikItemRates, payload);
      }
      setPabrikForm((f) => ({ ...f, kode_barang: '', tonase_per_item: '' }));
      await loadPabriks();
      notify(t('pabrikRateSaved'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setPabrikSaving(false);
    }
  };

  const handleDeletePabrikRate = async (id) => {
    notify('');
    try {
      await ensureCsrf();
      await api.delete(`${paths.adminPabrikItemRates}/${id}`);
      await loadPabriks();
      notify(t('pabrikRateDeleted'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    }
  };

  const busy = pabrikLoading || omsetLoading;

  return (
    <div className="space-y-8">
      {message && (
        <Alert tone={messageTone} onDismiss={() => notify('')}>
          {message}
        </Alert>
      )}

      <Card title={t('fieldOpsPeriodTitle')} description={t('fieldOpsPeriodHint')}>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('payrollMonth')}>
            <input
              type="month"
              className={inputClass}
              value={period}
              onChange={(e) => onPeriodChange(e.target.value)}
            />
          </Field>
          <Button variant="primary" onClick={refreshAll} disabled={busy}>
            {busy ? t('loading') : t('fieldOpsRefreshAll')}
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {periodLabelCalendar(period)} · {payrollCycleLabel(period)}
        </p>
      </Card>

      {showPabrik && (
        <section id="pabrik-catalog" className="scroll-mt-24">
          <Card title={t('pabrikCatalogTitle')} description={t('pabrikCatalogHint')}>
            {pabrikLoading && pabriks.length === 0 ? (
              <p className="text-sm text-slate-600">{t('loading')}</p>
            ) : pabriks.length === 0 ? (
              <p className="text-sm text-slate-600">{t('pabrikCatalogEmpty')}</p>
            ) : (
              <div className="space-y-3">
                {pabriks.map((pabrik) => (
                  <div
                    key={pabrik.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/40 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {pabrik.pabrik_code} — {pabrik.nama_pabrik}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {t('pabrikItemCount', { count: pabrik.items?.length ?? 0 })}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpandedPabrikCode((c) =>
                            c === pabrik.pabrik_code ? null : pabrik.pabrik_code
                          )
                        }
                      >
                        {expandedPabrikCode === pabrik.pabrik_code
                          ? t('pabrikHideItems')
                          : t('pabrikShowItems')}
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Field label={t('pabrikGoogleMaps')}>
                        <input
                          className={inputClass}
                          type="url"
                          placeholder={t('pabrikGoogleMapsPlaceholder')}
                          value={pabrikMapsDraft[pabrik.id] ?? ''}
                          onChange={(e) =>
                            setPabrikMapsDraft((d) => ({
                              ...d,
                              [pabrik.id]: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <div className="flex items-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={pabrikMapsSavingId === pabrik.id}
                          onClick={() => handleSavePabrikMaps(pabrik.id)}
                        >
                          {pabrikMapsSavingId === pabrik.id
                            ? t('loading')
                            : t('pabrikSaveMaps')}
                        </Button>
                        {pabrikMapsDraft[pabrik.id] ? (
                          <a
                            href={pabrikMapsDraft[pabrik.id]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-brand-600 hover:text-brand-700"
                          >
                            {t('pabrikOpenMaps')}
                          </a>
                        ) : null}
                      </div>
                    </div>
                    {expandedPabrikCode === pabrik.pabrik_code && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(pabrik.items || []).map((item) => (
                          <span
                            key={`${pabrik.pabrik_code}-${item.kode_barang}`}
                            className={`rounded-md border px-2 py-0.5 text-xs ${
                              Number(item.tonase_per_item) > 0
                                ? 'border-brand-200 bg-brand-50 text-brand-800'
                                : 'border-slate-200 bg-white text-slate-600'
                            }`}
                            title={
                              Number(item.tonase_per_item) > 0
                                ? `${t('pabrikItemTonase')}: ${item.tonase_per_item}`
                                : t('pabrikTonaseNotSet')
                            }
                          >
                            {item.kode_barang}
                            {Number(item.tonase_per_item) > 0
                              ? ` (${item.tonase_per_item})`
                              : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      )}

      {showTonase && (
        <section id="pabrik-tonase" className="scroll-mt-24">
          <Card title={t('pabrikItemRatesTitle')} description={t('pabrikItemRatesHint')}>
            <form className="mb-4 grid gap-3 sm:grid-cols-4" onSubmit={handleSavePabrikRate}>
              <Field label={t('pabrikItemPabrikCode')}>
                <select
                  className={inputClass}
                  value={pabrikForm.pabrik_code}
                  onChange={(e) =>
                    setPabrikForm((f) => ({
                      ...f,
                      pabrik_code: e.target.value,
                      kode_barang: '',
                    }))
                  }
                  required
                >
                  <option value="">{t('pabrikSelectCode')}</option>
                  {pabriks.map((p) => (
                    <option key={p.id} value={p.pabrik_code}>
                      {p.pabrik_code} — {p.nama_pabrik}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('pabrikItemKodeBarang')}>
                <input
                  className={inputClass}
                  list="field-ops-kode-barang-options"
                  value={pabrikForm.kode_barang}
                  onChange={(e) =>
                    setPabrikForm((f) => ({ ...f, kode_barang: e.target.value }))
                  }
                  required
                />
                <datalist id="field-ops-kode-barang-options">
                  {pabrikItemOptions.map((code) => (
                    <option key={code} value={code} />
                  ))}
                </datalist>
              </Field>
              <Field label={t('pabrikItemTonase')}>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  className={inputClass}
                  value={pabrikForm.tonase_per_item}
                  onChange={(e) =>
                    setPabrikForm((f) => ({ ...f, tonase_per_item: e.target.value }))
                  }
                  required
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" variant="primary" disabled={pabrikSaving}>
                  {pabrikSaving ? t('loading') : t('pabrikItemSaveTonase')}
                </Button>
              </div>
            </form>
            {pabrikRates.length === 0 ? (
              <p className="text-sm text-slate-600">{t('pabrikItemRatesEmpty')}</p>
            ) : (
              <div className="max-h-80 overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="px-2 py-2">{t('pabrikItemPabrikCode')}</th>
                      <th className="px-2 py-2">{t('pabrikNama')}</th>
                      <th className="px-2 py-2">{t('pabrikItemKodeBarang')}</th>
                      <th className="px-2 py-2 text-right">{t('pabrikItemTonase')}</th>
                      <th className="px-2 py-2 text-right">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pabrikRates.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="px-2 py-2 font-medium">{row.pabrik_code}</td>
                        <td className="px-2 py-2 text-slate-600">{row.nama_pabrik}</td>
                        <td className="px-2 py-2">{row.kode_barang}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {row.tonase_per_item}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDeletePabrikRate(row.id)}
                          >
                            {t('delete')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      )}

      {showOmset && (
        <section id="field-omset" className="scroll-mt-24">
          <Card title={t('fieldOmsetReportTitle')} description={t('fieldOmsetReportSubtitle')}>
            {omsetLoading && !report ? (
              <p className="text-sm text-slate-600">{t('loading')}</p>
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
                    sub={t('fieldOmsetByEmployeeHint')}
                  />
                </div>
                {!report.employees?.length ? (
                  <p className="text-sm text-slate-600">{t('fieldOmsetEmpty')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">{t('employee')}</th>
                          <th className="px-3 py-2 text-right">{t('fieldOmsetDeliveries')}</th>
                          <th className="px-3 py-2 text-right">{t('fieldOmsetTotal')}</th>
                          <th className="px-3 py-2 text-right">{t('fieldOmsetBonusTotal')}</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.employees.map((emp) => (
                          <React.Fragment key={emp.employee_id}>
                            <tr className="hover:bg-slate-50/80">
                              <td className="px-3 py-3">
                                <div className="font-medium text-slate-900">{emp.full_name}</div>
                                <div className="text-xs text-slate-500">{emp.employee_code}</div>
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums">
                                {emp.delivery_count}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums font-medium text-slate-900">
                                Rp {formatIdr(emp.omset_total)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-brand-700">
                                Rp {formatIdr(emp.bonus_total)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                <Button
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
                              </td>
                            </tr>
                            {expandedId === emp.employee_id && (
                              <tr>
                                <td colSpan={5} className="bg-slate-50/80 px-3 py-3">
                                  <ul className="space-y-2 text-xs text-slate-700">
                                    {emp.deliveries.map((d) => (
                                      <li
                                        key={d.id}
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                                      >
                                        <div className="flex flex-wrap justify-between gap-2">
                                          <span className="font-medium text-slate-900">
                                            {d.valid_on} · {d.pabrik_code} · {d.kode_barang}
                                          </span>
                                          <span>
                                            {t('fieldOmsetLineAmounts', {
                                              omset: formatIdr(d.omset_amount),
                                              bonus: formatIdr(d.bonus_amount),
                                            })}
                                          </span>
                                        </div>
                                        <div className="mt-1 text-slate-500">
                                          {t('fieldDelivery_selisih')}: {d.selisih} kg ·{' '}
                                          {t('pabrikItemTonase')}: {d.tonase_per_item}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-600">{t('fieldOmsetEmpty')}</p>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}
