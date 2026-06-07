import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Card, Field, StatTile, inputClass } from './ui.jsx';
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
  const showCatalog = showPabrik || showTonase;
  const omsetPeriod = periodProp ?? currentPayrollPeriodKey();
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');

  const [pabriks, setPabriks] = useState([]);
  const [pabrikOfficeLinkSavingId, setPabrikOfficeLinkSavingId] = useState(null);
  const [offices, setOffices] = useState([]);
  const [expandedPabrikCode, setExpandedPabrikCode] = useState(null);
  const [newFactoryForm, setNewFactoryForm] = useState({
    pabrik_code: '',
    nama_pabrik: '',
    office_id: '',
  });
  const [itemAddDraft, setItemAddDraft] = useState({});
  const [priceDraft, setPriceDraft] = useState({});
  const [priceSavingId, setPriceSavingId] = useState(null);
  const [factorySaving, setFactorySaving] = useState(false);
  const [itemSavingCode, setItemSavingCode] = useState(null);
  const [factoryDeletingId, setFactoryDeletingId] = useState(null);
  const [pabrikLoading, setPabrikLoading] = useState(false);
  const [tonaseExportFrom, setTonaseExportFrom] = useState('');
  const [tonaseExportTo, setTonaseExportTo] = useState('');
  const [tonaseExporting, setTonaseExporting] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogFilterOffice, setCatalogFilterOffice] = useState('');
  const [showAddFactoryForm, setShowAddFactoryForm] = useState(false);

  const [report, setReport] = useState(null);
  const [omsetLoading, setOmsetLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const notify = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const loadOffices = useCallback(async () => {
    if (!showCatalog) return;
    try {
      const { data } = await api.get(paths.offices);
      setOffices(Array.isArray(data) ? data : []);
    } catch {
      setOffices([]);
    }
  }, [showCatalog]);

  useEffect(() => {
    if (!showCatalog || offices.length === 0) return;
    setNewFactoryForm((f) => {
      if (f.office_id) return f;
      const withLink = offices.find((o) => o.link);
      return { ...f, office_id: withLink ? String(withLink.id) : '' };
    });
  }, [offices, showCatalog]);

  const loadPabriks = useCallback(async () => {
    if (!showCatalog) return;
    setPabrikLoading(true);
    try {
      const { data } = await api.get(paths.adminPabriks);
      const list = Array.isArray(data?.pabriks) ? data.pabriks : [];
      setPabriks(list);
      const items = list.flatMap((p) => p.items || []);
      setPriceDraft(
        Object.fromEntries(
          items.map((item) => [
            item.id,
            Number(item.price_per_item) > 0 ? String(item.price_per_item) : '',
          ])
        )
      );
    } catch (err) {
      setPabriks([]);
      setPriceDraft({});
      notify(translateApiMessage(err) || t('dashboardLoadFailed'), 'error');
    } finally {
      setPabrikLoading(false);
    }
  }, [showCatalog, t]);

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

  const catalogStats = useMemo(() => {
    const itemCount = pabriks.reduce((n, p) => n + (p.items?.length ?? 0), 0);
    const pricedCount = pabriks.reduce(
      (n, p) =>
        n + (p.items || []).filter((item) => Number(item.price_per_item) > 0).length,
      0
    );
    return { factories: pabriks.length, items: itemCount, priced: pricedCount };
  }, [pabriks]);

  const filteredPabriks = useMemo(() => {
    const q = catalogSearch.trim().toUpperCase();
    return pabriks.filter((pabrik) => {
      if (catalogFilterOffice && Number(pabrik.office_id) !== Number(catalogFilterOffice)) {
        return false;
      }
      if (!q) return true;
      const codeMatch = String(pabrik.pabrik_code).toUpperCase().includes(q);
      const nameMatch = String(pabrik.nama_pabrik).toUpperCase().includes(q);
      const itemMatch = (pabrik.items || []).some((item) =>
        String(item.kode_barang).toUpperCase().includes(q)
      );
      return codeMatch || nameMatch || itemMatch;
    });
  }, [pabriks, catalogSearch, catalogFilterOffice]);

  const catalogFiltersActive = Boolean(catalogSearch.trim() || catalogFilterOffice);

  const filterCatalogItems = useCallback(
    (items) => {
      const q = catalogSearch.trim().toUpperCase();
      if (!q) return items;
      return items.filter((item) => String(item.kode_barang).toUpperCase().includes(q));
    },
    [catalogSearch]
  );

  const handleCreateFactory = async (e) => {
    e.preventDefault();
    setFactorySaving(true);
    notify('');
    try {
      await ensureCsrf();
      await api.post(paths.adminPabriks, {
        pabrik_code: newFactoryForm.pabrik_code.trim(),
        nama_pabrik: newFactoryForm.nama_pabrik.trim(),
        office_id: Number(newFactoryForm.office_id),
      });
      const defaultOffice = offices.find((o) => o.link);
      setNewFactoryForm({
        pabrik_code: '',
        nama_pabrik: '',
        office_id: defaultOffice ? String(defaultOffice.id) : '',
      });
      setShowAddFactoryForm(false);
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

  const handleSaveInlinePrice = async (row) => {
    const draft = priceDraft[row.id] ?? '';
    const price = Number(draft) || 0;
    const current = Number(row.price_per_item) || 0;
    if (price === current) return;
    if (price <= 0 && Number(row.tonase_per_item) <= 0) {
      notify(t('pabrikItemRateRequired'), 'error');
      setPriceDraft((d) => ({
        ...d,
        [row.id]: current > 0 ? String(current) : '',
      }));
      return;
    }
    setPriceSavingId(row.id);
    notify('');
    try {
      await ensureCsrf();
      await api.put(`${paths.adminPabrikItemRates}/${row.id}`, {
        pabrik_code: row.pabrik_code,
        kode_barang: row.kode_barang,
        tonase_per_item: row.tonase_per_item,
        price_per_item: price,
      });
      await loadPabriks();
      notify(t('pabrikPriceSaved'), 'success');
    } catch (err) {
      setPriceDraft((d) => ({
        ...d,
        [row.id]: current > 0 ? String(current) : '',
      }));
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setPriceSavingId(null);
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

      {showCatalog && (
        <section id="pabrik-catalog" className="scroll-mt-24">
          <Card
            title={t('pabrikCatalogTitle')}
            description={t('pabrikCatalogHint')}
            action={
              <Button
                type="button"
                variant={showAddFactoryForm ? 'ghost' : 'primary'}
                size="sm"
                onClick={() => setShowAddFactoryForm((v) => !v)}
              >
                {showAddFactoryForm ? t('cancel') : t('pabrikAddFactory')}
              </Button>
            }
          >
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <StatTile label={t('pabrikCatalogStatFactories')} value={catalogStats.factories} />
              <StatTile label={t('pabrikCatalogStatItems')} value={catalogStats.items} />
              <StatTile
                label={t('pabrikCatalogStatPriced')}
                value={catalogStats.priced}
                sub={t('pabrikCatalogStatPricedSub')}
              />
            </div>

            <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <p className="mb-1 text-sm font-medium text-slate-800">
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

            {showAddFactoryForm && (
              <form
                className="mb-5 rounded-xl border border-brand-200 bg-brand-50/30 p-4"
                onSubmit={handleCreateFactory}
              >
                <p className="mb-3 text-sm font-medium text-slate-800">{t('pabrikCatalogNewFactory')}</p>
                <p className="mb-3 text-xs text-slate-500">
                  {t('pabrikLocationHint')}{' '}
                  <Link
                    to="/admin#location-management"
                    className="font-medium text-brand-600 hover:text-brand-700"
                  >
                    {t('pabrikLocationManageLink')}
                  </Link>
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)_auto]">
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
                  <Field label={t('pabrikLocation')}>
                    <select
                      className={inputClass}
                      value={newFactoryForm.office_id}
                      onChange={(e) =>
                        setNewFactoryForm((f) => ({ ...f, office_id: e.target.value }))
                      }
                      required
                    >
                      <option value="">{t('pabrikLocationSelect')}</option>
                      {offices.map((office) => (
                        <option key={office.id} value={office.id} disabled={!office.link}>
                          {office.name}
                          {!office.link ? ` (${t('pabrikOfficeNoMap')})` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex items-end gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={factorySaving || !newFactoryForm.office_id}
                    >
                      {factorySaving ? t('loading') : t('pabrikAddFactory')}
                    </Button>
                  </div>
                </div>
              </form>
            )}

            {pabrikLoading && pabriks.length === 0 ? (
              <p className="text-sm text-slate-600">{t('loading')}</p>
            ) : pabriks.length === 0 ? (
              <p className="text-sm text-slate-600">{t('pabrikCatalogEmpty')}</p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-end gap-3">
                  <Field label={t('pabrikCatalogSearch')} className="min-w-[12rem] flex-1">
                    <input
                      className={inputClass}
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      placeholder={t('pabrikCatalogSearchPlaceholder')}
                    />
                  </Field>
                  <Field label={t('pabrikCatalogFilterLocation')} className="min-w-[10rem]">
                    <select
                      className={inputClass}
                      value={catalogFilterOffice}
                      onChange={(e) => setCatalogFilterOffice(e.target.value)}
                    >
                      <option value="">{t('pabrikCatalogFilterAllLocations')}</option>
                      {offices.map((office) => (
                        <option key={office.id} value={office.id}>
                          {office.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {catalogFiltersActive ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mb-0.5"
                      onClick={() => {
                        setCatalogSearch('');
                        setCatalogFilterOffice('');
                      }}
                    >
                      {t('pabrikCatalogFilterClear')}
                    </Button>
                  ) : null}
                  <p className="mb-1 text-xs text-slate-500">
                    {t('pabrikCatalogFilterCount', {
                      shown: filteredPabriks.length,
                      total: pabriks.length,
                    })}
                  </p>
                </div>

                {filteredPabriks.length === 0 ? (
                  <p className="text-sm text-slate-600">{t('pabrikCatalogFilterNoMatch')}</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="w-10 px-3 py-2.5" />
                          <th className="px-3 py-2.5">{t('pabrikItemPabrikCode')}</th>
                          <th className="px-3 py-2.5">{t('pabrikNama')}</th>
                          <th className="px-3 py-2.5">{t('pabrikLocation')}</th>
                          <th className="px-3 py-2.5 text-center">{t('pabrikCatalogItemsCol')}</th>
                          <th className="px-3 py-2.5 text-right">{t('pabrikCatalogActions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredPabriks.map((pabrik) => {
                          const isExpanded = expandedPabrikCode === pabrik.pabrik_code;
                          const visibleItems = filterCatalogItems(pabrik.items || []);
                          return (
                            <React.Fragment key={pabrik.id}>
                              <tr className="bg-white hover:bg-slate-50/60">
                                <td className="px-3 py-3">
                                  <button
                                    type="button"
                                    className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                    aria-expanded={isExpanded}
                                    aria-label={
                                      isExpanded ? t('pabrikHideItems') : t('pabrikShowItems')
                                    }
                                    onClick={() =>
                                      setExpandedPabrikCode((c) =>
                                        c === pabrik.pabrik_code ? null : pabrik.pabrik_code
                                      )
                                    }
                                  >
                                    <span
                                      className={`inline-block text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                    >
                                      ▶
                                    </span>
                                  </button>
                                </td>
                                <td className="px-3 py-3 font-semibold tabular-nums text-slate-900">
                                  {pabrik.pabrik_code}
                                </td>
                                <td className="px-3 py-3 text-slate-700">{pabrik.nama_pabrik}</td>
                                <td className="px-3 py-3">
                                  <select
                                    className="min-w-[10rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60"
                                    value={pabrik.office_id ?? ''}
                                    disabled={pabrikOfficeLinkSavingId === pabrik.id}
                                    onChange={(e) =>
                                      handleLinkPabrikOffice(pabrik.id, e.target.value)
                                    }
                                  >
                                    <option value="">{t('pabrikLocationNone')}</option>
                                    {offices.map((office) => (
                                      <option
                                        key={office.id}
                                        value={office.id}
                                        disabled={!office.link}
                                      >
                                        {office.name}
                                        {!office.link ? ` (${t('pabrikOfficeNoMap')})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <Badge variant="neutral">
                                    {pabrik.items?.length ?? 0}
                                  </Badge>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex items-center justify-end gap-2">
                                    {pabrik.google_maps_url ? (
                                      <a
                                        href={pabrik.google_maps_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-medium text-brand-600 hover:text-brand-700"
                                      >
                                        {t('pabrikOpenMaps')}
                                      </a>
                                    ) : (
                                      <span className="text-xs text-amber-700">
                                        {t('pabrikNoLocation')}
                                      </span>
                                    )}
                                    <Button
                                      type="button"
                                      variant="danger"
                                      size="sm"
                                      disabled={factoryDeletingId === pabrik.id}
                                      onClick={() => handleDeleteFactory(pabrik)}
                                    >
                                      {factoryDeletingId === pabrik.id
                                        ? t('loading')
                                        : t('delete')}
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-slate-50/70">
                                  <td colSpan={6} className="px-3 py-4">
                                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                                      <p className="mb-3 text-sm font-medium text-slate-800">
                                        {t('pabrikCatalogManageItems', {
                                          factory: pabrik.nama_pabrik,
                                        })}
                                      </p>
                                      <p className="mb-3 text-xs text-slate-500">
                                        {t('pabrikCatalogAddItemHint')}
                                      </p>
                                      <form
                                        className="mb-4 flex flex-wrap items-end gap-2 border-b border-slate-100 pb-4"
                                        onSubmit={(e) => handleAddItemCode(e, pabrik)}
                                      >
                                        <Field
                                          label={t('pabrikItemKodeBarang')}
                                          className="min-w-[12rem] flex-1"
                                        >
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
                                          variant="primary"
                                          size="sm"
                                          disabled={itemSavingCode === pabrik.pabrik_code}
                                        >
                                          {itemSavingCode === pabrik.pabrik_code
                                            ? t('loading')
                                            : t('pabrikItemAdd')}
                                        </Button>
                                      </form>
                                      {visibleItems.length === 0 ? (
                                        <p className="text-sm text-slate-500">
                                          {t('pabrikCatalogNoItems')}
                                        </p>
                                      ) : (
                                        <div className="overflow-x-auto">
                                          <table className="min-w-full text-left text-sm">
                                            <thead>
                                              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                                                <th className="px-2 py-2">
                                                  {t('pabrikItemKodeBarang')}
                                                </th>
                                                <th className="px-2 py-2 text-right">
                                                  {t('pabrikItemTonase')}
                                                </th>
                                                <th className="px-2 py-2 text-right">
                                                  {t('pabrikItemPrice')}
                                                </th>
                                                <th className="px-2 py-2 text-right" />
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {visibleItems.map((item) => {
                                                const rateRow = {
                                                  ...item,
                                                  pabrik_code: pabrik.pabrik_code,
                                                  nama_pabrik: pabrik.nama_pabrik,
                                                };
                                                return (
                                                <tr
                                                  key={`${pabrik.pabrik_code}-${item.kode_barang}`}
                                                  className="border-b border-slate-100 last:border-0"
                                                >
                                                  <td className="px-2 py-2 font-medium text-slate-900">
                                                    {item.kode_barang}
                                                  </td>
                                                  <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                                                    {Number(item.tonase_per_item) > 0
                                                      ? item.tonase_per_item
                                                      : '—'}
                                                  </td>
                                                  <td className="px-2 py-2 text-right">
                                                    <input
                                                      type="number"
                                                      min="0"
                                                      step="1"
                                                      className="w-28 rounded border border-slate-200 bg-white px-2 py-1 text-right text-sm tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
                                                      value={priceDraft[item.id] ?? ''}
                                                      placeholder="0"
                                                      disabled={priceSavingId === item.id}
                                                      onChange={(e) =>
                                                        setPriceDraft((d) => ({
                                                          ...d,
                                                          [item.id]: e.target.value,
                                                        }))
                                                      }
                                                      onBlur={() => handleSaveInlinePrice(rateRow)}
                                                      onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                          e.preventDefault();
                                                          e.currentTarget.blur();
                                                        }
                                                        if (e.key === 'Escape') {
                                                          const current =
                                                            Number(item.price_per_item) || 0;
                                                          setPriceDraft((d) => ({
                                                            ...d,
                                                            [item.id]:
                                                              current > 0 ? String(current) : '',
                                                          }));
                                                          e.currentTarget.blur();
                                                        }
                                                      }}
                                                    />
                                                  </td>
                                                  <td className="px-2 py-2 text-right">
                                                    <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="sm"
                                                      className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                                      onClick={() => handleDeletePabrikRate(item.id)}
                                                    >
                                                      {t('pabrikDeleteItem')}
                                                    </Button>
                                                  </td>
                                                </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
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
