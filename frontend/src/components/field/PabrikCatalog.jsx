import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Card, Field, StatTile, inputClass } from '../ui.jsx';
import { api, paths, ensureCsrf, downloadBlobResponse } from '../../api/client.js';
import { translateApiMessage } from '../../translateApi.js';
import { useNotify } from '../../hooks/useNotify.js';
import {
  currentPayrollPeriodKey,
  payrollCycleBounds,
} from '../../utils/payrollPeriod.js';

export default function PabrikCatalog() {
  const { t } = useTranslation();
  const [notification, notify, dismiss] = useNotify();

  const [pabriks, setPabriks] = useState([]);
  const [pabrikOfficeLinkSavingId, setPabrikOfficeLinkSavingId] = useState(null);
  const [offices, setOffices] = useState([]);
  const [expandedPabrikCode, setExpandedPabrikCode] = useState(null);
  const [newFactoryForm, setNewFactoryForm] = useState({
    pabrik_code: '',
    nama_pabrik: '',
    office_id: '',
    radius_meters: '',
  });
  const [radiusDraft, setRadiusDraft] = useState({});
  const [radiusSavingId, setRadiusSavingId] = useState(null);
  const [itemAddDraft, setItemAddDraft] = useState({});
  const [itemNameAddDraft, setItemNameAddDraft] = useState({});
  const [priceDraft, setPriceDraft] = useState({});
  const [priceSavingId, setPriceSavingId] = useState(null);
  const [nameDraft, setNameDraft] = useState({});
  const [nameSavingId, setNameSavingId] = useState(null);
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

  const loadOffices = useCallback(async () => {
    try {
      const { data } = await api.get(paths.offices);
      setOffices(Array.isArray(data) ? data : []);
    } catch {
      setOffices([]);
    }
  }, []);

  const loadPabriks = useCallback(async () => {
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
      setNameDraft(
        Object.fromEntries(items.map((item) => [item.id, item.nama_barang || '']))
      );
    } catch (err) {
      setPabriks([]);
      setPriceDraft({});
      setNameDraft({});
      notify(translateApiMessage(err) || t('dashboardLoadFailed'), 'error');
    } finally {
      setPabrikLoading(false);
    }
  }, [t, notify]);

  useEffect(() => { loadOffices(); }, [loadOffices]);
  useEffect(() => { loadPabriks(); }, [loadPabriks]);

  useEffect(() => {
    if (offices.length === 0) return;
    setNewFactoryForm((f) => {
      if (f.office_id) return f;
      const withLink = offices.find((o) => o.link);
      return { ...f, office_id: withLink ? String(withLink.id) : '' };
    });
  }, [offices]);

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
      if (catalogFilterOffice && Number(pabrik.office_id) !== Number(catalogFilterOffice))
        return false;
      if (!q) return true;
      const codeMatch = String(pabrik.pabrik_code).toUpperCase().includes(q);
      const nameMatch = String(pabrik.nama_pabrik).toUpperCase().includes(q);
      const itemMatch = (pabrik.items || []).some(
        (item) =>
          String(item.kode_barang).toUpperCase().includes(q) ||
          String(item.nama_barang || '').toUpperCase().includes(q)
      );
      return codeMatch || nameMatch || itemMatch;
    });
  }, [pabriks, catalogSearch, catalogFilterOffice]);

  const catalogFiltersActive = Boolean(catalogSearch.trim() || catalogFilterOffice);

  const sortedOffices = useMemo(
    () =>
      [...offices].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
      ),
    [offices]
  );

  const filterCatalogItems = useCallback(
    (items) => {
      const q = catalogSearch.trim().toUpperCase();
      if (!q) return items;
      return items.filter(
        (item) =>
          String(item.kode_barang).toUpperCase().includes(q) ||
          String(item.nama_barang || '').toUpperCase().includes(q)
      );
    },
    [catalogSearch]
  );

  const handleCreateFactory = async (e) => {
    e.preventDefault();
    setFactorySaving(true);
    dismiss();
    try {
      await ensureCsrf();
      await api.post(paths.adminPabriks, {
        pabrik_code: newFactoryForm.pabrik_code.trim(),
        nama_pabrik: newFactoryForm.nama_pabrik.trim(),
        office_id: Number(newFactoryForm.office_id),
        radius_meters: newFactoryForm.radius_meters.trim() || null,
      });
      const defaultOffice = offices.find((o) => o.link);
      setNewFactoryForm({
        pabrik_code: '',
        nama_pabrik: '',
        office_id: defaultOffice ? String(defaultOffice.id) : '',
        radius_meters: '',
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
    if (!window.confirm(t('pabrikConfirmDeleteFactory', { name: pabrik.nama_pabrik }))) return;
    setFactoryDeletingId(pabrik.id);
    dismiss();
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
    dismiss();
    try {
      await ensureCsrf();
      await api.post(paths.adminPabrikItemRates, {
        pabrik_code: pabrik.pabrik_code,
        kode_barang: kode,
        nama_barang: (itemNameAddDraft[pabrik.pabrik_code] || '').trim(),
      });
      setItemAddDraft((d) => ({ ...d, [pabrik.pabrik_code]: '' }));
      setItemNameAddDraft((d) => ({ ...d, [pabrik.pabrik_code]: '' }));
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
    dismiss();
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

  const handleSaveRadius = async (pabrik, rawValue) => {
    const trimmed = String(rawValue ?? '').trim();
    const current = pabrik.radius_meters != null ? String(pabrik.radius_meters) : '';
    if (trimmed === current) return;
    if (trimmed !== '' && (!Number.isInteger(Number(trimmed)) || Number(trimmed) < 1)) {
      notify(t('pabrikRadiusInvalid'), 'error');
      setRadiusDraft((d) => ({ ...d, [pabrik.id]: current }));
      return;
    }
    setRadiusSavingId(pabrik.id);
    dismiss();
    try {
      await ensureCsrf();
      await api.put(paths.adminPabrik(pabrik.id), {
        radius_meters: trimmed === '' ? null : Number(trimmed),
      });
      await loadPabriks();
      notify(t('pabrikRadiusUpdated'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
      setRadiusDraft((d) => ({ ...d, [pabrik.id]: current }));
    } finally {
      setRadiusSavingId(null);
    }
  };

  const handleSaveInlineName = async (row) => {
    const draft = (nameDraft[row.id] ?? '').trim();
    const current = String(row.nama_barang || '').trim();
    if (draft === current) return;
    setNameSavingId(row.id);
    dismiss();
    try {
      await ensureCsrf();
      await api.put(`${paths.adminPabrikItemRates}/${row.id}`, {
        pabrik_code: row.pabrik_code,
        kode_barang: row.kode_barang,
        nama_barang: draft,
        price_per_item: row.price_per_item,
      });
      await loadPabriks();
      notify(t('pabrikItemNameSaved'), 'success');
    } catch (err) {
      setNameDraft((d) => ({ ...d, [row.id]: current }));
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setNameSavingId(null);
    }
  };

  const handleSaveInlinePrice = async (row) => {
    const draft = priceDraft[row.id] ?? '';
    const price = Number(draft) || 0;
    const current = Number(row.price_per_item) || 0;
    if (price === current) return;
    if (price <= 0) {
      notify(t('pabrikItemRateRequired'), 'error');
      setPriceDraft((d) => ({
        ...d,
        [row.id]: current > 0 ? String(current) : '',
      }));
      return;
    }
    setPriceSavingId(row.id);
    dismiss();
    try {
      await ensureCsrf();
      await api.put(`${paths.adminPabrikItemRates}/${row.id}`, {
        pabrik_code: row.pabrik_code,
        kode_barang: row.kode_barang,
        nama_barang: row.nama_barang || '',
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
    dismiss();
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
    dismiss();
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
    <section id="pabrik-catalog" className="scroll-mt-24">
      {notification && (
        <Alert tone={notification.tone} onDismiss={dismiss}>
          {notification.text}
        </Alert>
      )}
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

        <div className="apple-panel mb-6">
          <p className="mb-1 text-[15px] font-medium text-apple-text">
            {t('pabrikTonaseExportTitle')}
          </p>
          <p className="mb-4 text-[13px] leading-relaxed text-apple-label">
            {t('pabrikTonaseExportHint')}
          </p>
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
            className="mb-6 rounded-apple-lg border border-brand-100 bg-brand-50/40 p-5"
            onSubmit={handleCreateFactory}
          >
            <p className="mb-3 text-[15px] font-medium text-apple-text">
              {t('pabrikCatalogNewFactory')}
            </p>
            <p className="mb-4 text-[13px] text-apple-label">
              {t('pabrikLocationHint')}{' '}
              <a href="#location-management" className="apple-link">
                {t('pabrikLocationManageLink')}
              </a>
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,0.8fr)_auto]">
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
                  {sortedOffices.map((office) => (
                    <option key={office.id} value={office.id} disabled={!office.link}>
                      {office.name}
                      {!office.link ? ` (${t('pabrikOfficeNoMap')})` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('pabrikRadius')} hint={t('pabrikRadiusHint')}>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  className={inputClass}
                  value={newFactoryForm.radius_meters}
                  onChange={(e) =>
                    setNewFactoryForm((f) => ({ ...f, radius_meters: e.target.value }))
                  }
                  placeholder={t('pabrikRadiusDefault')}
                />
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
          <p className="text-[15px] text-apple-label">{t('loading')}</p>
        ) : pabriks.length === 0 ? (
          <p className="text-[15px] text-apple-label">{t('pabrikCatalogEmpty')}</p>
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
                  {sortedOffices.map((office) => (
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
              <p className="mb-1 text-[12px] text-apple-muted">
                {t('pabrikCatalogFilterCount', {
                  shown: filteredPabriks.length,
                  total: pabriks.length,
                })}
              </p>
            </div>

            {filteredPabriks.length === 0 ? (
              <p className="text-[15px] text-apple-label">{t('pabrikCatalogFilterNoMatch')}</p>
            ) : (
              <div className="apple-table-wrap">
                <table className="apple-table">
                  <thead className="apple-table-head">
                    <tr>
                      <th className="w-10" />
                      <th>{t('pabrikItemPabrikCode')}</th>
                      <th>{t('pabrikNama')}</th>
                      <th>{t('pabrikLocation')}</th>
                      <th>{t('pabrikRadius')}</th>
                      <th className="text-center">{t('pabrikCatalogItemsCol')}</th>
                      <th className="text-right">{t('pabrikCatalogActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPabriks.map((pabrik) => {
                      const isExpanded = expandedPabrikCode === pabrik.pabrik_code;
                      const visibleItems = filterCatalogItems(pabrik.items || []);
                      return (
                        <React.Fragment key={pabrik.id}>
                          <tr className="apple-table-row">
                            <td>
                              <button
                                type="button"
                                className="flex h-8 w-8 items-center justify-center rounded-full text-apple-label transition hover:bg-apple-highlight hover:text-brand-700"
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
                                  className={`inline-block text-xs transition-transform duration-premium ease-premium ${isExpanded ? 'rotate-90' : ''}`}
                                >
                                  ▶
                                </span>
                              </button>
                            </td>
                            <td className="font-semibold tabular-nums text-apple-text">
                              {pabrik.pabrik_code}
                            </td>
                            <td className="text-apple-text">{pabrik.nama_pabrik}</td>
                            <td>
                              <select
                                className="min-w-[10rem] rounded-apple border border-apple-border bg-apple-fill px-3 py-2 text-[14px] text-apple-text focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-60"
                                value={pabrik.office_id ?? ''}
                                disabled={pabrikOfficeLinkSavingId === pabrik.id}
                                onChange={(e) =>
                                  handleLinkPabrikOffice(pabrik.id, e.target.value)
                                }
                              >
                                <option value="">{t('pabrikLocationNone')}</option>
                                {sortedOffices.map((office) => (
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
                            <td>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                inputMode="numeric"
                                className="w-24 rounded-apple border border-apple-border bg-apple-fill px-3 py-2 text-[14px] text-apple-text focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-60"
                                value={
                                  radiusDraft[pabrik.id] ??
                                  (pabrik.radius_meters != null
                                    ? String(pabrik.radius_meters)
                                    : '')
                                }
                                disabled={radiusSavingId === pabrik.id}
                                placeholder={t('pabrikRadiusDefault')}
                                onChange={(e) =>
                                  setRadiusDraft((d) => ({
                                    ...d,
                                    [pabrik.id]: e.target.value,
                                  }))
                                }
                                onBlur={(e) => handleSaveRadius(pabrik, e.target.value)}
                              />
                            </td>
                            <td className="text-center">
                              <Badge variant="neutral">{pabrik.items?.length ?? 0}</Badge>
                            </td>
                            <td>
                              <div className="flex items-center justify-end gap-2">
                                {pabrik.google_maps_url ? (
                                  <a
                                    href={pabrik.google_maps_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="apple-link text-[13px]"
                                  >
                                    {t('pabrikOpenMaps')}
                                  </a>
                                ) : (
                                  <span className="text-[13px] text-amber-700">
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
                            <tr className="bg-apple-highlight/60">
                              <td colSpan={7} className="!px-4 !py-5">
                                <div className="apple-expand-panel">
                                  <p className="mb-2 text-[15px] font-medium text-apple-text">
                                    {t('pabrikCatalogManageItems', {
                                      factory: pabrik.nama_pabrik,
                                    })}
                                  </p>
                                  <p className="mb-4 text-[13px] text-apple-label">
                                    {t('pabrikCatalogAddItemHint')}
                                  </p>
                                  <form
                                    className="mb-5 flex flex-wrap items-end gap-3 border-b border-black/[0.06] pb-5"
                                    onSubmit={(e) => handleAddItemCode(e, pabrik)}
                                  >
                                    <Field
                                      label={t('pabrikItemKodeBarang')}
                                      className="min-w-[10rem] flex-1"
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
                                    <Field
                                      label={t('pabrikItemNamaBarang')}
                                      className="min-w-[12rem] flex-[2]"
                                    >
                                      <input
                                        className={inputClass}
                                        value={itemNameAddDraft[pabrik.pabrik_code] ?? ''}
                                        onChange={(e) =>
                                          setItemNameAddDraft((d) => ({
                                            ...d,
                                            [pabrik.pabrik_code]: e.target.value,
                                          }))
                                        }
                                        placeholder={t('pabrikItemNamaBarangPlaceholder')}
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
                                    <p className="text-[15px] text-apple-label">
                                      {t('pabrikCatalogNoItems')}
                                    </p>
                                  ) : (
                                    <div className="apple-table-wrap border-0 shadow-none">
                                      <table className="apple-table">
                                        <thead className="apple-table-head">
                                          <tr>
                                            <th>{t('pabrikItemKodeBarang')}</th>
                                            <th>{t('pabrikItemNamaBarang')}</th>
                                            <th className="text-right">
                                              {t('pabrikItemPrice')}
                                            </th>
                                            <th className="text-right" />
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
                                                className="apple-table-row"
                                              >
                                                <td className="font-medium text-apple-text">
                                                  {item.kode_barang}
                                                </td>
                                                <td>
                                                  <input
                                                    type="text"
                                                    className="w-full min-w-[10rem] rounded-apple border border-apple-border bg-white px-3 py-1.5 text-[14px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-60"
                                                    value={nameDraft[item.id] ?? ''}
                                                    placeholder={t('pabrikItemNamaBarangPlaceholder')}
                                                    disabled={nameSavingId === item.id}
                                                    onChange={(e) =>
                                                      setNameDraft((d) => ({
                                                        ...d,
                                                        [item.id]: e.target.value,
                                                      }))
                                                    }
                                                    onBlur={() =>
                                                      handleSaveInlineName(rateRow)
                                                    }
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        e.currentTarget.blur();
                                                      }
                                                      if (e.key === 'Escape') {
                                                        setNameDraft((d) => ({
                                                          ...d,
                                                          [item.id]: item.nama_barang || '',
                                                        }));
                                                        e.currentTarget.blur();
                                                      }
                                                    }}
                                                  />
                                                </td>
                                                <td className="text-right">
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    className="w-28 rounded-apple border border-apple-border bg-white px-3 py-1.5 text-right text-[14px] tabular-nums focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-60"
                                                    value={priceDraft[item.id] ?? ''}
                                                    placeholder="0"
                                                    disabled={priceSavingId === item.id}
                                                    onChange={(e) =>
                                                      setPriceDraft((d) => ({
                                                        ...d,
                                                        [item.id]: e.target.value,
                                                      }))
                                                    }
                                                    onBlur={() =>
                                                      handleSaveInlinePrice(rateRow)
                                                    }
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
                                                            current > 0
                                                              ? String(current)
                                                              : '',
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
                                                    onClick={() =>
                                                      handleDeletePabrikRate(item.id)
                                                    }
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
  );
}
