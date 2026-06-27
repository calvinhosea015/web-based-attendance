import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Card, Field, FilterChip, StatTile, inputClass } from './ui.jsx';
import { api, paths, ensureCsrf, downloadBlobResponse } from '../api/client.js';
import { translateApiMessage } from '../translateApi.js';
import {
  currentPayrollPeriodKey,
  payrollCycleBounds,
  payrollCycleLabel,
} from '../utils/payrollPeriod.js';
import { fieldDeliveryDisplayFields } from '../utils/fieldCheckout.js';
import { formatDisplayDate } from '../utils/formatDate.js';

function formatIdr(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

/**
 * @param {{ period?: string, onPeriodChange?: (p: string) => void, showOmset?: boolean, showPabrik?: boolean, showTonase?: boolean, showDeliveryRecap?: boolean, recapEditable?: boolean }} props
 */
export default function FieldOperationsPanel({
  period: periodProp,
  onPeriodChange,
  showOmset = true,
  showPabrik = true,
  showTonase = true,
  showDeliveryRecap = false,
  recapEditable = false,
}) {
  const showCatalog = showPabrik || showTonase;
  const showTabs = showCatalog && showOmset;
  const omsetPeriod = periodProp ?? currentPayrollPeriodKey();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('omset');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');

  const showCatalogPanel = showCatalog && (!showTabs || activeTab === 'catalog');
  const showOmsetPanel = showOmset && (!showTabs || activeTab === 'omset');

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
  const [priceDraft, setPriceDraft] = useState({});
  const [priceSavingId, setPriceSavingId] = useState(null);
  const [tonaseDraft, setTonaseDraft] = useState({});
  const [tonaseSavingId, setTonaseSavingId] = useState(null);
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
  const [newOffice, setNewOffice] = useState({ name: '', locationLink: '' });
  const [editingOffice, setEditingOffice] = useState(null);
  const [officeSaving, setOfficeSaving] = useState(false);

  const [report, setReport] = useState(null);
  const [omsetLoading, setOmsetLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [allDeliveries, setAllDeliveries] = useState([]);
  const [recapLoading, setRecapLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

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
      setTonaseDraft(
        Object.fromEntries(
          items.map((item) => [
            item.id,
            Number(item.tonase_per_item) > 0 ? String(item.tonase_per_item) : '',
          ])
        )
      );
    } catch (err) {
      setPabriks([]);
      setPriceDraft({});
      setTonaseDraft({});
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

  const loadAllDeliveries = useCallback(async () => {
    if (!showDeliveryRecap) return;
    setRecapLoading(true);
    try {
      const { data } = await api.get(paths.adminFieldDeliveries);
      setAllDeliveries(Array.isArray(data) ? data : []);
    } catch (err) {
      setAllDeliveries([]);
      notify(translateApiMessage(err) || t('dashboardLoadFailed'), 'error');
    } finally {
      setRecapLoading(false);
    }
  }, [showDeliveryRecap, t]);

  const startEditDelivery = (row) => {
    setEditingId(row.id);
    setEditForm({
      pabrik_code: row.pabrik_code ?? '',
      kode_barang: row.kode_barang ?? '',
      norek: row.norek ?? '',
      nomor_tanda_terima: row.nomor_tanda_terima ?? '',
      nomor_surat_jalan: row.nomor_surat_jalan ?? '',
      nopol: row.nopol ?? '',
      no_bs: row.no_bs ?? '',
      kotor: row.kotor ?? '',
      berat_bersih: row.berat_bersih ?? '',
    });
  };

  const cancelEditDelivery = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveDeliveryEdit = async (id) => {
    setSavingDelivery(true);
    notify('');
    try {
      await ensureCsrf();
      const { data } = await api.put(paths.adminFieldDeliveryUpdate(id), editForm);
      const updated = data?.entry;
      // Keep joined display fields (full_name, nama_pabrik, …) from the existing row.
      setAllDeliveries((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...(updated || {}) } : r))
      );
      cancelEditDelivery();
      notify(t('fieldDeliveryEditSaved'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || t('dashboardLoadFailed'), 'error');
    } finally {
      setSavingDelivery(false);
    }
  };

  const deleteDelivery = async (id) => {
    // ponytail: native confirm is enough here; no custom modal asked for.
    if (!window.confirm(t('fieldDeliveryDeleteConfirm'))) return;
    setDeletingId(id);
    notify('');
    try {
      await ensureCsrf();
      await api.delete(paths.adminFieldDeliveryUpdate(id));
      setAllDeliveries((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) cancelEditDelivery();
      notify(t('fieldDeliveryDeleteSaved'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || t('dashboardLoadFailed'), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'location-management' || hash === 'pabrik-catalog') {
      setActiveTab('catalog');
    }
  }, []);

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
    loadAllDeliveries();
  }, [loadAllDeliveries]);

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

  const sortedOffices = useMemo(() => {
    return [...offices].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
  }, [offices]);

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
    notify('');
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

  const handleSaveInlineTonase = async (row) => {
    const draft = tonaseDraft[row.id] ?? '';
    const tonase = Number(draft) || 0;
    const current = Number(row.tonase_per_item) || 0;
    if (tonase === current) return;
    if (tonase <= 0 && Number(row.price_per_item) <= 0) {
      notify(t('pabrikItemRateRequired'), 'error');
      setTonaseDraft((d) => ({
        ...d,
        [row.id]: current > 0 ? String(current) : '',
      }));
      return;
    }
    setTonaseSavingId(row.id);
    notify('');
    try {
      await ensureCsrf();
      await api.put(`${paths.adminPabrikItemRates}/${row.id}`, {
        pabrik_code: row.pabrik_code,
        kode_barang: row.kode_barang,
        tonase_per_item: tonase,
        price_per_item: row.price_per_item,
      });
      await loadPabriks();
      notify(t('pabrikRateSaved'), 'success');
    } catch (err) {
      setTonaseDraft((d) => ({
        ...d,
        [row.id]: current > 0 ? String(current) : '',
      }));
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setTonaseSavingId(null);
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

  const handleAddOffice = async (e) => {
    e.preventDefault();
    setOfficeSaving(true);
    notify('');
    try {
      await ensureCsrf();
      await api.post(paths.offices, newOffice);
      setNewOffice({ name: '', locationLink: '' });
      await Promise.all([loadOffices(), loadPabriks()]);
      notify(t('officeAdded'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setOfficeSaving(false);
    }
  };

  const handleDeleteOffice = async (id) => {
    const linked = pabriks.filter((p) => Number(p.office_id) === Number(id));
    if (
      linked.length &&
      !window.confirm(
        t('confirmDeleteOfficeWithFactories', {
          count: linked.length,
          names: linked.map((p) => p.nama_pabrik).join(', '),
        })
      )
    ) {
      return;
    }
    notify('');
    try {
      await ensureCsrf();
      await api.delete(paths.office(id));
      if (editingOffice != null && Number(editingOffice.id) === Number(id)) {
        setEditingOffice(null);
      }
      await Promise.all([loadOffices(), loadPabriks()]);
      notify(t('officeDeleted'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    }
  };

  const openEditOffice = (office) => {
    setEditingOffice({
      id: office.id,
      name: office.name || '',
      locationLink: office.link || '',
    });
  };

  const handleSaveOffice = async (e) => {
    e.preventDefault();
    if (!editingOffice) return;
    setOfficeSaving(true);
    notify('');
    try {
      await ensureCsrf();
      await api.patch(paths.office(editingOffice.id), {
        name: editingOffice.name,
        locationLink: editingOffice.locationLink,
      });
      setEditingOffice(null);
      await Promise.all([loadOffices(), loadPabriks()]);
      notify(t('officeUpdated'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setOfficeSaving(false);
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
    <div className="space-y-10">
      {message && (
        <Alert tone={messageTone} onDismiss={() => notify('')}>
          {message}
        </Alert>
      )}

      {showTabs && (
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label={t('fieldOpsDashboardTitle')}
        >
          <FilterChip
            active={activeTab === 'omset'}
            role="tab"
            aria-selected={activeTab === 'omset'}
            onClick={() => setActiveTab('omset')}
          >
            {t('fieldOpsTabOmset')}
          </FilterChip>
          <FilterChip
            active={activeTab === 'catalog'}
            role="tab"
            aria-selected={activeTab === 'catalog'}
            onClick={() => setActiveTab('catalog')}
          >
            {t('fieldOpsTabCatalog')}
          </FilterChip>
        </div>
      )}

      {showCatalogPanel && (
        <section id="location-management" className="scroll-mt-24">
          <Card title={t('locationManagement')} description={t('locationManagementHint')}>
            <form className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]" onSubmit={handleAddOffice}>
              <Field label={t('officeName')}>
                <input
                  className={inputClass}
                  value={newOffice.name}
                  onChange={(e) => setNewOffice({ ...newOffice, name: e.target.value })}
                  required
                />
              </Field>
              <Field label={t('locationLink')}>
                <input
                  className={inputClass}
                  value={newOffice.locationLink}
                  onChange={(e) => setNewOffice({ ...newOffice, locationLink: e.target.value })}
                  required
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" variant="primary" disabled={officeSaving}>
                  {officeSaving ? t('loading') : t('addOffice')}
                </Button>
              </div>
            </form>
            {offices.length === 0 ? (
              <p className="text-[15px] text-apple-label">{t('noOfficesAvailable')}</p>
            ) : (
              <ul className="max-h-96 divide-y divide-black/[0.04] overflow-y-auto rounded-apple-lg border border-black/[0.06]">
                {sortedOffices.map((office) => {
                  const linkedFactories = pabriks.filter(
                    (p) => Number(p.office_id) === Number(office.id)
                  );
                  return (
                    <li
                      key={office.id}
                      className="flex flex-col gap-2 bg-white px-4 py-3.5 sm:px-5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-apple-text">{office.name}</div>
                          {office.link ? (
                            <a
                              className="apple-link text-[12px]"
                              href={office.link}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t('mapLink')}
                            </a>
                          ) : null}
                          {office.lat != null && office.lng != null ? (
                            <p className="mt-0.5 text-xs text-apple-label">
                              {Number(office.lat).toFixed(5)}, {Number(office.lng).toFixed(5)}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-apple-label">
                            {t('locationFactories')}:{' '}
                            {linkedFactories.length ? (
                              linkedFactories
                                .map((p) => `${p.pabrik_code} — ${p.nama_pabrik}`)
                                .join(', ')
                            ) : (
                              <span className="text-apple-muted">{t('locationFactoriesNone')}</span>
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditOffice(office)}
                          >
                            {t('editOffice')}
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => handleDeleteOffice(office.id)}
                          >
                            {t('delete')}
                          </Button>
                        </div>
                      </div>
                      {editingOffice != null && Number(editingOffice.id) === Number(office.id) ? (
                        <form
                          className="space-y-2 rounded-apple-lg border border-black/[0.06] bg-apple-highlight/40 p-3"
                          onSubmit={handleSaveOffice}
                        >
                          <Field label={t('officeName')}>
                            <input
                              className={inputClass}
                              value={editingOffice.name}
                              onChange={(e) =>
                                setEditingOffice({ ...editingOffice, name: e.target.value })
                              }
                              required
                            />
                          </Field>
                          <Field label={t('locationLink')}>
                            <input
                              className={inputClass}
                              value={editingOffice.locationLink}
                              onChange={(e) =>
                                setEditingOffice({ ...editingOffice, locationLink: e.target.value })
                              }
                              required
                            />
                          </Field>
                          <div className="flex gap-2">
                            <Button type="submit" variant="primary" size="sm" disabled={officeSaving}>
                              {officeSaving ? t('loading') : t('saveOffice')}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingOffice(null)}
                            >
                              {t('cancel')}
                            </Button>
                          </div>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>
      )}

      {showCatalogPanel && (
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

            <div className="apple-panel mb-6">
              <p className="mb-1 text-[15px] font-medium text-apple-text">
                {t('pabrikTonaseExportTitle')}
              </p>
              <p className="mb-4 text-[13px] leading-relaxed text-apple-label">{t('pabrikTonaseExportHint')}</p>
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
                <p className="mb-3 text-[15px] font-medium text-apple-text">{t('pabrikCatalogNewFactory')}</p>
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
                                      (pabrik.radius_meters != null ? String(pabrik.radius_meters) : '')
                                    }
                                    disabled={radiusSavingId === pabrik.id}
                                    placeholder={t('pabrikRadiusDefault')}
                                    onChange={(e) =>
                                      setRadiusDraft((d) => ({ ...d, [pabrik.id]: e.target.value }))
                                    }
                                    onBlur={(e) => handleSaveRadius(pabrik, e.target.value)}
                                  />
                                </td>
                                <td className="text-center">
                                  <Badge variant="neutral">
                                    {pabrik.items?.length ?? 0}
                                  </Badge>
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
                                        <p className="text-[15px] text-apple-label">
                                          {t('pabrikCatalogNoItems')}
                                        </p>
                                      ) : (
                                        <div className="apple-table-wrap border-0 shadow-none">
                                          <table className="apple-table">
                                            <thead className="apple-table-head">
                                              <tr>
                                                <th>{t('pabrikItemKodeBarang')}</th>
                                                <th className="text-right">{t('pabrikItemTonase')}</th>
                                                <th className="text-right">{t('pabrikItemPrice')}</th>
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
                                                  <td className="text-right">
                                                    <input
                                                      type="number"
                                                      min="0"
                                                      step="any"
                                                      className="w-28 rounded-apple border border-apple-border bg-white px-3 py-1.5 text-right text-[14px] tabular-nums focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-60"
                                                      value={tonaseDraft[item.id] ?? ''}
                                                      placeholder="0"
                                                      disabled={tonaseSavingId === item.id}
                                                      onChange={(e) =>
                                                        setTonaseDraft((d) => ({
                                                          ...d,
                                                          [item.id]: e.target.value,
                                                        }))
                                                      }
                                                      onBlur={() => handleSaveInlineTonase(rateRow)}
                                                      onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                          e.preventDefault();
                                                          e.currentTarget.blur();
                                                        }
                                                        if (e.key === 'Escape') {
                                                          const current =
                                                            Number(item.tonase_per_item) || 0;
                                                          setTonaseDraft((d) => ({
                                                            ...d,
                                                            [item.id]:
                                                              current > 0 ? String(current) : '',
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

      {showOmsetPanel && (
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
              <p className="text-[15px] text-apple-label">{t('loading')}</p>
            ) : report ? (
              <div className="space-y-8">
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

          {showDeliveryRecap && (
            <Card
              className="mt-6"
              title={t('fieldDeliveryRecapTitle')}
              description={t('fieldDeliveryRecapHint')}
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={recapLoading}
                  onClick={() => {
                    notify('');
                    loadAllDeliveries();
                  }}
                >
                  {recapLoading ? t('loading') : t('fieldOmsetRefresh')}
                </Button>
              }
            >
              {recapLoading && !allDeliveries.length ? (
                <p className="text-[15px] text-apple-label">{t('loading')}</p>
              ) : allDeliveries.length ? (
                <>
                  <p className="mb-4 text-[13px] text-apple-label">
                    {t('fieldDeliveryRecapCount', { count: allDeliveries.length })}
                  </p>
                  <ul className="max-h-[32rem] space-y-3 overflow-y-auto text-sm">
                    {allDeliveries.map((row) => {
                      const parsed = fieldDeliveryDisplayFields(row);
                      return (
                        <li
                          key={row.id}
                          className="rounded-apple-lg border border-black/[0.04] bg-apple-fill/80 px-3 py-3"
                        >
                          <div className="font-medium text-apple-text">
                            {row.full_name}
                            {row.employee_code ? ` · ${row.employee_code}` : ''}
                            {row.office_name ? ` · ${row.office_name}` : ''}
                          </div>
                          <div className="mt-1 text-apple-label">
                            {t('fieldDeliveryDate')}: {formatDisplayDate(row.valid_on)}
                          </div>
                          {row.checkout_code ? (
                            <p className="mt-2 font-mono text-xs text-apple-text break-all">
                              {row.checkout_code}
                            </p>
                          ) : null}
                          {recapEditable && editingId === row.id ? (
                            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {[
                                ['pabrik_code', 'pabrik', 'text'],
                                ['kode_barang', 'kode_barang', 'text'],
                                ['norek', 'norek', 'text'],
                                ['nomor_tanda_terima', 'nomor_tanda_terima', 'text'],
                                ['nomor_surat_jalan', 'nomor_surat_jalan', 'text'],
                                ['nopol', 'nopol', 'text'],
                                ['no_bs', 'no_bs', 'text'],
                                ['kotor', 'kotor', 'number'],
                                ['berat_bersih', 'berat_bersih', 'number'],
                              ].map(([name, labelKey, type]) => (
                                <label key={name} className="block">
                                  <span className="text-xs uppercase tracking-wide text-apple-label">
                                    {t(`fieldDelivery_${labelKey}`, labelKey)}
                                  </span>
                                  <input
                                    type={type}
                                    inputMode={type === 'number' ? 'decimal' : undefined}
                                    step={type === 'number' ? 'any' : undefined}
                                    min={type === 'number' ? '0' : undefined}
                                    className={`${inputClass} mt-1`}
                                    value={editForm[name] ?? ''}
                                    onChange={(e) =>
                                      setEditForm((f) => ({ ...f, [name]: e.target.value }))
                                    }
                                  />
                                </label>
                              ))}
                              <p className="text-xs text-apple-label sm:col-span-2 lg:col-span-3">
                                {t('fieldDeliveryEditRecalcHint')}
                              </p>
                              <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={savingDelivery}
                                  onClick={() => saveDeliveryEdit(row.id)}
                                >
                                  {savingDelivery ? t('loading') : t('save')}
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={savingDelivery}
                                  onClick={cancelEditDelivery}
                                >
                                  {t('cancel')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {parsed ? (
                                <dl className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
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
                              {row.bonus_amount != null || row.omset_amount != null ? (
                                <p className="mt-2 text-xs text-apple-label">
                                  {row.omset_amount != null ? (
                                    <>
                                      {t('fieldOmsetTotal')}: Rp {formatIdr(row.omset_amount)}
                                    </>
                                  ) : null}
                                  {row.bonus_amount != null ? (
                                    <>
                                      {row.omset_amount != null ? ' · ' : ''}
                                      {t('fieldOmsetBonusTotal')}: Rp {formatIdr(row.bonus_amount)}
                                    </>
                                  ) : null}
                                </p>
                              ) : null}
                              {recapEditable ? (
                                <div className="mt-3 flex gap-2">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => startEditDelivery(row)}
                                  >
                                    {t('fieldDeliveryEdit')}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="danger"
                                    size="sm"
                                    disabled={deletingId === row.id}
                                    onClick={() => deleteDelivery(row.id)}
                                  >
                                    {deletingId === row.id ? t('loading') : t('fieldDeliveryDelete')}
                                  </Button>
                                </div>
                              ) : null}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="text-[15px] text-apple-label">{t('fieldDeliveryEmpty')}</p>
              )}
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
