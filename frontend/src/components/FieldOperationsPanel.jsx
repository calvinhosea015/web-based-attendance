import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, Field, StatTile, inputClass } from './ui.jsx';
import { api, paths, ensureCsrf, downloadBlobResponse } from '../api/client.js';
import { translateApiMessage } from '../translateApi.js';
import {
  currentPayrollPeriodKey,
  payrollCycleBounds,
  payrollCycleLabel,
} from '../utils/payrollPeriod.js';

function formatIdr(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

function itemRateConfigured(item) {
  return Number(item?.tonase_per_item) > 0 || Number(item?.price_per_item) > 0;
}

/**
 * @param {{ period?: string, onPeriodChange?: (p: string) => void, showOmset?: boolean, showPabrik?: boolean, showTonase?: boolean }} props
 */
export default function FieldOperationsPanel({
  period: periodProp,
  onPeriodChange,
  showOmset = true,
  showPabrik = true,
  showTonase = true,
}) {
  const omsetPeriod = periodProp ?? currentPayrollPeriodKey();
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');

  const [pabriks, setPabriks] = useState([]);
  const [pabrikRates, setPabrikRates] = useState([]);
  const [pabrikMapsDraft, setPabrikMapsDraft] = useState({});
  const [pabrikMapsSavingId, setPabrikMapsSavingId] = useState(null);
  const [pabrikOfficeLinkSavingId, setPabrikOfficeLinkSavingId] = useState(null);
  const [offices, setOffices] = useState([]);
  const [expandedPabrikCode, setExpandedPabrikCode] = useState(null);
  const [pabrikForm, setPabrikForm] = useState({
    pabrik_code: '',
    kode_barang: '',
    tonase_per_item: '',
    price_per_item: '',
  });
  const [newFactoryForm, setNewFactoryForm] = useState({
    pabrik_code: '',
    nama_pabrik: '',
  });
  const [itemAddDraft, setItemAddDraft] = useState({});
  const [pabrikSaving, setPabrikSaving] = useState(false);
  const [factorySaving, setFactorySaving] = useState(false);
  const [itemSavingCode, setItemSavingCode] = useState(null);
  const [factoryDeletingId, setFactoryDeletingId] = useState(null);
  const [pabrikLoading, setPabrikLoading] = useState(false);
  const [tonaseExportFrom, setTonaseExportFrom] = useState('');
  const [tonaseExportTo, setTonaseExportTo] = useState('');
  const [tonaseExporting, setTonaseExporting] = useState(false);

  const [report, setReport] = useState(null);
  const [omsetLoading, setOmsetLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const notify = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const loadOffices = useCallback(async () => {
    if (!showPabrik) return;
    try {
      const { data } = await api.get(paths.offices);
      setOffices(Array.isArray(data) ? data : []);
    } catch {
      setOffices([]);
    }
  }, [showPabrik]);

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
      const res = await api.get(paths.financeFieldOmset(omsetPeriod));
      setReport(res.data);
    } catch (err) {
      setReport(null);
      notify(translateApiMessage(err) || t('dashboardLoadFailed'), 'error');
    } finally {
      setOmsetLoading(false);
    }
  }, [omsetPeriod, showOmset, t]);

  useEffect(() => {
    loadOffices();
  }, [loadOffices]);

  useEffect(() => {
    loadPabriks();
  }, [loadPabriks]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    const bounds = payrollCycleBounds(currentPayrollPeriodKey());
    if (bounds) {
      setTonaseExportFrom(bounds.period_start);
      setTonaseExportTo(bounds.period_end);
    }
  }, []);

  const pabrikItemOptions = useMemo(() => {
    const pabrik = pabriks.find((p) => p.pabrik_code === pabrikForm.pabrik_code);
    return (pabrik?.items || []).map((item) => item.kode_barang);
  }, [pabriks, pabrikForm.pabrik_code]);

  const handleCreateFactory = async (e) => {
    e.preventDefault();
    setFactorySaving(true);
    notify('');
    try {
      await ensureCsrf();
      await api.post(paths.adminPabriks, {
        pabrik_code: newFactoryForm.pabrik_code.trim(),
        nama_pabrik: newFactoryForm.nama_pabrik.trim(),
      });
      setNewFactoryForm({ pabrik_code: '', nama_pabrik: '' });
      await loadPabriks();
      notify(t('pabrikFactoryAdded'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setFactorySaving(false);
    }
  };

  const handleDeleteFactory = async (pabrik) => {
    if (!window.confirm(t('pabrikConfirmDeleteFactory', { name: pabrik.nama_pabrik }))) {
      return;
    }
    setFactoryDeletingId(pabrik.id);
    notify('');
    try {
      await ensureCsrf();
      await api.delete(paths.adminPabrik(pabrik.id));
      if (expandedPabrikCode === pabrik.pabrik_code) setExpandedPabrikCode(null);
      await loadPabriks();
      notify(t('pabrikFactoryDeleted'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setFactoryDeletingId(null);
    }
  };

  const handleAddItemCode = async (e, pabrik) => {
    e.preventDefault();
    const kode = (itemAddDraft[pabrik.pabrik_code] || '').trim();
    if (!kode) return;
    setItemSavingCode(pabrik.pabrik_code);
    notify('');
    try {
      await ensureCsrf();
      await api.post(paths.adminPabrikItemRates, {
        pabrik_code: pabrik.pabrik_code,
        kode_barang: kode,
        tonase_per_item: 0,
      });
      setItemAddDraft((d) => ({ ...d, [pabrik.pabrik_code]: '' }));
      await loadPabriks();
      notify(t('pabrikItemAdded'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setItemSavingCode(null);
    }
  };

  const handleLinkPabrikOffice = async (pabrikId, officeId) => {
    setPabrikOfficeLinkSavingId(pabrikId);
    notify('');
    try {
      await ensureCsrf();
      await api.put(paths.adminPabrik(pabrikId), {
        office_id: officeId ? Number(officeId) : null,
      });
      await loadPabriks();
      notify(t('pabrikOfficeLinked'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setPabrikOfficeLinkSavingId(null);
    }
  };

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
    const tonase = Number(pabrikForm.tonase_per_item) || 0;
    const price = Number(pabrikForm.price_per_item) || 0;
    if (tonase <= 0 && price <= 0) {
      notify(t('pabrikItemRateRequired'), 'error');
      return;
    }
    setPabrikSaving(true);
    notify('');
    try {
      await ensureCsrf();
      const payload = {
        pabrik_code: pabrikForm.pabrik_code.trim(),
        kode_barang: pabrikForm.kode_barang.trim(),
        tonase_per_item: tonase,
        price_per_item: price,
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
      setPabrikForm((f) => ({
        ...f,
        kode_barang: '',
        tonase_per_item: '',
        price_per_item: '',
      }));
      await loadPabriks();
      notify(t('pabrikRateSaved'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setPabrikSaving(false);
    }
  };

  const handleDownloadTonaseBonus = async () => {
    if (!tonaseExportFrom || !tonaseExportTo) return;
    setTonaseExporting(true);
    notify('');
    try {
      const res = await api.get(paths.adminFieldTonaseBonusExport, {
        params: { from: tonaseExportFrom, to: tonaseExportTo },
        responseType: 'blob',
      });
      downloadBlobResponse(res, `tonase_bonus_${tonaseExportFrom}_${tonaseExportTo}.xlsx`);
      notify(t('pabrikTonaseExported'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setTonaseExporting(false);
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

  return (
    <div className="space-y-8">
      {message && (
        <Alert tone={messageTone} onDismiss={() => notify('')}>
          {message}
        </Alert>
      )}

      {showPabrik && (
        <section id="pabrik-catalog" className="scroll-mt-24">
          <Card title={t('pabrikCatalogTitle')} description={t('pabrikCatalogHint')}>
            <form
              className="mb-4 grid gap-3 border-b border-slate-200 pb-4 sm:grid-cols-[1fr_2fr_auto]"
              onSubmit={handleCreateFactory}
            >
              <Field label={t('pabrikItemPabrikCode')}>
                <input
                  className={inputClass}
                  value={newFactoryForm.pabrik_code}
                  onChange={(e) =>
                    setNewFactoryForm((f) => ({ ...f, pabrik_code: e.target.value }))
                  }
                  placeholder="1"
                  required
                />
              </Field>
              <Field label={t('pabrikNama')}>
                <input
                  className={inputClass}
                  value={newFactoryForm.nama_pabrik}
                  onChange={(e) =>
                    setNewFactoryForm((f) => ({ ...f, nama_pabrik: e.target.value }))
                  }
                  required
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" variant="primary" disabled={factorySaving}>
                  {factorySaving ? t('loading') : t('pabrikAddFactory')}
                </Button>
              </div>
            </form>
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
                      <div className="flex flex-wrap gap-2">
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
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={factoryDeletingId === pabrik.id}
                          onClick={() => handleDeleteFactory(pabrik)}
                        >
                          {factoryDeletingId === pabrik.id
                            ? t('loading')
                            : t('pabrikDeleteFactory')}
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 space-y-3">
                      <Field label={t('pabrikLinkOffice')}>
                        <select
                          className={inputClass}
                          value={pabrik.office_id ?? ''}
                          disabled={pabrikOfficeLinkSavingId === pabrik.id}
                          onChange={(e) => handleLinkPabrikOffice(pabrik.id, e.target.value)}
                        >
                          <option value="">{t('pabrikLinkOfficeNone')}</option>
                          {offices.map((office) => (
                            <option key={office.id} value={office.id} disabled={!office.link}>
                              {office.name}
                              {!office.link ? ` (${t('pabrikOfficeNoMap')})` : ''}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {pabrik.office_id ? (
                        <p className="text-xs text-slate-600">
                          {t('pabrikMapsFromOffice', { name: pabrik.office_name || '—' })}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">{t('pabrikLinkOfficeHint')}</p>
                      )}
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <Field label={t('pabrikGoogleMaps')}>
                          <input
                            className={inputClass}
                            type="url"
                            placeholder={t('pabrikGoogleMapsPlaceholder')}
                            value={pabrikMapsDraft[pabrik.id] ?? ''}
                            disabled={Boolean(pabrik.office_id)}
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
                            disabled={
                              pabrikMapsSavingId === pabrik.id || Boolean(pabrik.office_id)
                            }
                            onClick={() => handleSavePabrikMaps(pabrik.id)}
                          >
                            {pabrikMapsSavingId === pabrik.id
                              ? t('loading')
                              : t('pabrikSaveMaps')}
                          </Button>
                          {(pabrikMapsDraft[pabrik.id] || pabrik.google_maps_url) ? (
                            <a
                              href={pabrik.google_maps_url || pabrikMapsDraft[pabrik.id]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-brand-600 hover:text-brand-700"
                            >
                              {t('pabrikOpenMaps')}
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {expandedPabrikCode === pabrik.pabrik_code && (
                      <div className="mt-3 space-y-3">
                        <form
                          className="flex flex-wrap items-end gap-2"
                          onSubmit={(e) => handleAddItemCode(e, pabrik)}
                        >
                          <Field label={t('pabrikItemKodeBarang')} className="min-w-[12rem] flex-1">
                            <input
                              className={inputClass}
                              value={itemAddDraft[pabrik.pabrik_code] ?? ''}
                              onChange={(e) =>
                                setItemAddDraft((d) => ({
                                  ...d,
                                  [pabrik.pabrik_code]: e.target.value,
                                }))
                              }
                              placeholder="PA1"
                              required
                            />
                          </Field>
                          <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                            disabled={itemSavingCode === pabrik.pabrik_code}
                          >
                            {itemSavingCode === pabrik.pabrik_code
                              ? t('loading')
                              : t('pabrikItemAdd')}
                          </Button>
                        </form>
                        <div className="flex flex-wrap gap-1.5">
                          {(pabrik.items || []).map((item) => (
                            <span
                              key={`${pabrik.pabrik_code}-${item.kode_barang}`}
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
                                itemRateConfigured(item)
                                  ? 'border-brand-200 bg-brand-50 text-brand-800'
                                  : 'border-slate-200 bg-white text-slate-600'
                              }`}
                              title={
                                itemRateConfigured(item)
                                  ? [
                                      Number(item.tonase_per_item) > 0
                                        ? `${t('pabrikItemTonase')}: ${item.tonase_per_item}`
                                        : null,
                                      Number(item.price_per_item) > 0
                                        ? `${t('pabrikItemPrice')}: Rp ${formatIdr(item.price_per_item)}`
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')
                                  : t('pabrikTonaseNotSet')
                              }
                            >
                              <span>
                                {item.kode_barang}
                                {itemRateConfigured(item)
                                  ? ` (${[
                                      Number(item.tonase_per_item) > 0 ? item.tonase_per_item : null,
                                      Number(item.price_per_item) > 0
                                        ? `Rp${formatIdr(item.price_per_item)}`
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' / ')})`
                                  : ''}
                              </span>
                              <button
                                type="button"
                                className="rounded px-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                                aria-label={t('pabrikDeleteItem')}
                                onClick={() => handleDeletePabrikRate(item.id)}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
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
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <p className="mb-3 text-sm font-medium text-slate-800">
                {t('pabrikTonaseExportTitle')}
              </p>
              <p className="mb-3 text-xs text-slate-500">{t('pabrikTonaseExportHint')}</p>
              <div className="flex flex-wrap items-end gap-3">
                <Field label={t('pabrikTonaseDateFrom')}>
                  <input
                    type="date"
                    className={inputClass}
                    value={tonaseExportFrom}
                    onChange={(e) => setTonaseExportFrom(e.target.value)}
                    required
                  />
                </Field>
                <Field label={t('pabrikTonaseDateTo')}>
                  <input
                    type="date"
                    className={inputClass}
                    value={tonaseExportTo}
                    onChange={(e) => setTonaseExportTo(e.target.value)}
                    required
                  />
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={tonaseExporting || !tonaseExportFrom || !tonaseExportTo}
                  onClick={handleDownloadTonaseBonus}
                >
                  {tonaseExporting ? t('loading') : t('pabrikTonaseDownload')}
                </Button>
              </div>
            </div>
            <form className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={handleSavePabrikRate}>
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
                />
              </Field>
              <Field label={t('pabrikItemPrice')}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className={inputClass}
                  value={pabrikForm.price_per_item}
                  onChange={(e) =>
                    setPabrikForm((f) => ({ ...f, price_per_item: e.target.value }))
                  }
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" variant="primary" disabled={pabrikSaving}>
                  {pabrikSaving ? t('loading') : t('pabrikItemSaveRate')}
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
                      <th className="px-2 py-2 text-right">{t('pabrikItemPrice')}</th>
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
                        <td className="px-2 py-2 text-right tabular-nums">
                          {Number(row.price_per_item) > 0
                            ? `Rp ${formatIdr(row.price_per_item)}`
                            : '—'}
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
                      notify('');
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
                    sub={t('fieldOmsetOfficerCountHint', { count: report.employees.length })}
                  />
                </div>
                {!report.employees?.length ? (
                  <p className="text-sm text-slate-600">{t('fieldOmsetNoOfficers')}</p>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {t('fieldOmsetByEmployee')}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {t('fieldOmsetByEmployeeHint', { count: report.employees.length })}
                      </p>
                    </div>
                    {report.delivery_count === 0 ? (
                      <p className="text-sm text-slate-600">{t('fieldOmsetEmpty')}</p>
                    ) : null}
                    <div className="space-y-3">
                      {report.employees.map((emp) => (
                        <div
                          key={emp.employee_id}
                          className="rounded-xl border border-slate-200 bg-slate-50/40 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-900">{emp.full_name}</div>
                              <div className="text-xs text-slate-500">{emp.employee_code}</div>
                            </div>
                            <div className="grid gap-3 text-right sm:grid-cols-3 sm:gap-6">
                              <div>
                                <div className="text-xs uppercase tracking-wide text-slate-500">
                                  {t('fieldOmsetDeliveries')}
                                </div>
                                <div className="mt-0.5 tabular-nums font-medium text-slate-900">
                                  {emp.delivery_count}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-slate-500">
                                  {t('fieldOmsetTotal')}
                                </div>
                                <div className="mt-0.5 tabular-nums font-medium text-slate-900">
                                  Rp {formatIdr(emp.omset_total)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-slate-500">
                                  {t('fieldOmsetBonusTotal')}
                                </div>
                                <div className="mt-0.5 tabular-nums font-medium text-brand-700">
                                  Rp {formatIdr(emp.bonus_total)}
                                </div>
                              </div>
                            </div>
                          </div>
                          {emp.deliveries.length > 0 ? (
                            <div className="mt-3 border-t border-slate-200 pt-3">
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
                                <ul className="mt-2 space-y-2 text-xs text-slate-700">
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
                            <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
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
              <p className="text-sm text-slate-600">{t('fieldOmsetEmpty')}</p>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}
