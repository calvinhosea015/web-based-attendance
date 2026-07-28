import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, Field, inputClass } from '../ui.jsx';
import { api, paths, ensureCsrf } from '../../api/client.js';
import { translateApiMessage } from '../../translateApi.js';
import { useNotify } from '../../hooks/useNotify.js';
import {
  fieldDeliveryDisplayFields,
  filterDeliveryRecap,
  uniqueDeliveryFilterValues,
} from '../../utils/fieldCheckout.js';
import { formatDisplayDate } from '../../utils/formatDate.js';
import { formatIdr } from '../../utils/payrollDisplay.js';

/**
 * @param {{ editable?: boolean, officeScope?: boolean, reviewEditable?: boolean }} props
 */
export default function DeliveryRecap({
  editable = false,
  officeScope = false,
  reviewEditable = false,
}) {
  const { t } = useTranslation();
  const [notification, notify, dismiss] = useNotify();

  const [allDeliveries, setAllDeliveries] = useState([]);
  const [recapLoading, setRecapLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [filterPabrik, setFilterPabrik] = useState('');
  const [filterOfficer, setFilterOfficer] = useState('');
  const [filterKodeBarang, setFilterKodeBarang] = useState('');

  const [rowReviewDraft, setRowReviewDraft] = useState({});
  const [reviewSavingId, setReviewSavingId] = useState(null);

  const getRowReviewDraft = (row) => {
    const draft = rowReviewDraft[row.id];
    if (draft) return draft;
    const review = row.recap_review;
    if (review && typeof review.is_correct === 'boolean') {
      return { verdict: review.is_correct, notes: review.notes || '' };
    }
    return { verdict: null, notes: '' };
  };

  const setRowDraft = (row, patch) => {
    setRowReviewDraft((prev) => {
      const base =
        prev[row.id] ??
        (row.recap_review && typeof row.recap_review.is_correct === 'boolean'
          ? { verdict: row.recap_review.is_correct, notes: row.recap_review.notes || '' }
          : { verdict: null, notes: '' });
      return { ...prev, [row.id]: { ...base, ...patch } };
    });
  };

  const saveRowReview = async (row) => {
    const draft = getRowReviewDraft(row);
    if (typeof draft.verdict !== 'boolean') {
      notify(t('fieldDeliveryRecapReviewVerdictRequired'), 'error');
      return;
    }
    if (!draft.verdict && !draft.notes.trim()) {
      notify(t('fieldDeliveryRecapReviewNotesRequired'), 'error');
      return;
    }
    setReviewSavingId(row.id);
    dismiss();
    try {
      await ensureCsrf();
      const { data } = await api.post(paths.employeeDeliveryRecapReviews, {
        delivery_entry_id: row.id,
        is_correct: draft.verdict,
        notes: draft.notes.trim() || null,
      });
      setAllDeliveries((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, recap_review: data || null } : r))
      );
      setRowReviewDraft((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      notify(t('fieldDeliveryRecapReviewSaved'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || t('dashboardLoadFailed'), 'error');
    } finally {
      setReviewSavingId(null);
    }
  };

  const loadAllDeliveries = useCallback(async () => {
    setRecapLoading(true);
    try {
      const path = officeScope ? paths.employeeFieldDeliveries : paths.adminFieldDeliveries;
      const { data } = await api.get(path, { params: { limit: 5000 } });
      setAllDeliveries(Array.isArray(data) ? data : []);
    } catch (err) {
      setAllDeliveries([]);
      notify(translateApiMessage(err) || t('dashboardLoadFailed'), 'error');
    } finally {
      setRecapLoading(false);
    }
  }, [officeScope, t, notify]);

  useEffect(() => {
    loadAllDeliveries();
  }, [loadAllDeliveries]);

  const pabrikOptions = useMemo(() => {
    const codes = uniqueDeliveryFilterValues(allDeliveries, 'pabrik_code');
    return codes.map((code) => {
      const sample = allDeliveries.find((r) => String(r.pabrik_code ?? '').trim() === code);
      const nama = String(sample?.nama_pabrik ?? '').trim();
      return { value: code, label: nama ? `${code} (${nama})` : code };
    });
  }, [allDeliveries]);

  const officerOptions = useMemo(() => {
    const byCode = new Map();
    for (const row of allDeliveries) {
      const code = String(row.employee_code ?? '').trim();
      const name = String(row.full_name ?? '').trim();
      if (!code && !name) continue;
      const key = code || name;
      if (!byCode.has(key)) byCode.set(key, { value: key, label: name || code });
    }
    return [...byCode.values()].sort((a, b) => a.label.localeCompare(b.label, 'id'));
  }, [allDeliveries]);

  const kodeBarangOptions = useMemo(
    () => uniqueDeliveryFilterValues(allDeliveries, 'kode_barang'),
    [allDeliveries]
  );

  const filtersActive = Boolean(
    filterPabrik || filterOfficer || filterKodeBarang || filterDateFrom || filterDateTo
  );

  const filteredDeliveries = useMemo(
    () =>
      filterDeliveryRecap(allDeliveries, {
        pabrik: filterPabrik,
        officer: filterOfficer,
        kodeBarang: filterKodeBarang,
        dateFrom: filterDateFrom,
        dateTo: filterDateTo,
      }),
    [
      allDeliveries,
      filterPabrik,
      filterOfficer,
      filterKodeBarang,
      filterDateFrom,
      filterDateTo,
    ]
  );

  const clearFilters = () => {
    setFilterPabrik('');
    setFilterOfficer('');
    setFilterKodeBarang('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

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
    dismiss();
    try {
      await ensureCsrf();
      const { data } = await api.put(paths.adminFieldDeliveryUpdate(id), editForm);
      const updated = data?.entry;
      setAllDeliveries((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                ...(updated || {}),
                ...(data.recap_review != null ? { recap_review: data.recap_review } : {}),
              }
            : r
        )
      );
      cancelEditDelivery();
      window.dispatchEvent(new Event('admin-pending-refresh'));
      notify(t('fieldDeliveryEditSaved'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || t('dashboardLoadFailed'), 'error');
    } finally {
      setSavingDelivery(false);
    }
  };

  const deleteDelivery = async (id) => {
    if (!window.confirm(t('fieldDeliveryDeleteConfirm'))) return;
    setDeletingId(id);
    dismiss();
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

  return (
    <>
      {notification && (
        <Alert tone={notification.tone} onDismiss={dismiss}>
          {notification.text}
        </Alert>
      )}
      <Card
        title={t('fieldDeliveryRecapTitle')}
        description={t('fieldDeliveryRecapHint')}
        collapsible
        defaultOpen
        action={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={recapLoading}
            onClick={() => {
              dismiss();
              loadAllDeliveries();
            }}
          >
            {recapLoading ? t('loading') : t('fieldOmsetRefresh')}
          </Button>
        }
      >
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label={t('fieldDeliveryRecapFilterDateFrom')} className="min-w-[10rem]">
            <input
              type="date"
              className={inputClass}
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </Field>
          <Field label={t('fieldDeliveryRecapFilterDateTo')} className="min-w-[10rem]">
            <input
              type="date"
              className={inputClass}
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </Field>
          <Field label={t('fieldDeliveryRecapFilterPabrik')} className="min-w-[10rem]">
            <select
              className={inputClass}
              value={filterPabrik}
              onChange={(e) => setFilterPabrik(e.target.value)}
            >
              <option value="">{t('fieldDeliveryRecapFilterAll')}</option>
              {pabrikOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('fieldDeliveryRecapFilterOfficer')} className="min-w-[12rem]">
            <select
              className={inputClass}
              value={filterOfficer}
              onChange={(e) => setFilterOfficer(e.target.value)}
            >
              <option value="">{t('fieldDeliveryRecapFilterAll')}</option>
              {officerOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('fieldDeliveryRecapFilterKodeBarang')} className="min-w-[10rem]">
            <select
              className={inputClass}
              value={filterKodeBarang}
              onChange={(e) => setFilterKodeBarang(e.target.value)}
            >
              <option value="">{t('fieldDeliveryRecapFilterAll')}</option>
              {kodeBarangOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </Field>
          {filtersActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-0.5"
              onClick={clearFilters}
            >
              {t('fieldDeliveryRecapFilterClear')}
            </Button>
          ) : null}
        </div>

        {recapLoading && !allDeliveries.length ? (
          <p className="text-[15px] text-apple-label">{t('loading')}</p>
        ) : allDeliveries.length ? (
          <>
            <p className="mb-4 text-[13px] text-apple-label">
              {filtersActive
                ? t('fieldDeliveryRecapFilterCount', {
                    shown: filteredDeliveries.length,
                    total: allDeliveries.length,
                  })
                : t('fieldDeliveryRecapCount', { count: allDeliveries.length })}
            </p>
            {filteredDeliveries.length ? (
              <ul className="max-h-[32rem] space-y-3 overflow-y-auto text-sm">
                {filteredDeliveries.map((row) => {
                  const parsed = fieldDeliveryDisplayFields(row);
                  const reviewDraft = getRowReviewDraft(row);
                  const reviewSaving = reviewSavingId === row.id;
                  const showRowReview =
                    editingId !== row.id &&
                    (reviewEditable ||
                      (row.recap_review?.reviewed_at &&
                        typeof row.recap_review.is_correct === 'boolean'));
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
                      {editable && editingId === row.id ? (
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
                          {showRowReview ? (
                            <div className="mt-3 border-t border-black/[0.06] pt-3">
                              <p className="text-xs font-medium text-apple-label">
                                {t('fieldDeliveryRecapReviewTitle')}
                              </p>
                              {row.recap_review?.reviewed_at &&
                              typeof row.recap_review.is_correct === 'boolean' &&
                              !rowReviewDraft[row.id] ? (
                                <p className="mt-1 text-xs text-apple-label">
                                  {t('fieldDeliveryRecapReviewLastSaved', {
                                    name:
                                      row.recap_review.reviewer_full_name ||
                                      row.recap_review.reviewer_username ||
                                      '—',
                                    date: formatDisplayDate(row.recap_review.reviewed_at),
                                    verdict: row.recap_review.is_correct
                                      ? t('fieldDeliveryRecapReviewCorrect')
                                      : t('fieldDeliveryRecapReviewIncorrect'),
                                  })}
                                  {row.recap_review.notes ? (
                                    <span className="mt-1 block text-apple-text">
                                      “{row.recap_review.notes}”
                                    </span>
                                  ) : null}
                                </p>
                              ) : null}
                              {reviewEditable ? (
                                <div className="mt-2 space-y-2">
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={reviewDraft.verdict === true ? 'primary' : 'secondary'}
                                      onClick={() => setRowDraft(row, { verdict: true })}
                                    >
                                      {t('fieldDeliveryRecapReviewCorrect')}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={reviewDraft.verdict === false ? 'danger' : 'secondary'}
                                      onClick={() => setRowDraft(row, { verdict: false })}
                                    >
                                      {t('fieldDeliveryRecapReviewIncorrect')}
                                    </Button>
                                  </div>
                                  {reviewDraft.verdict === false ? (
                                    <textarea
                                      className={`${inputClass} min-h-[3rem] resize-y text-sm`}
                                      placeholder={t('fieldDeliveryRecapReviewNotesPlaceholder')}
                                      value={reviewDraft.notes}
                                      onChange={(e) => setRowDraft(row, { notes: e.target.value })}
                                      maxLength={500}
                                    />
                                  ) : null}
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={
                                      reviewSaving || typeof reviewDraft.verdict !== 'boolean'
                                    }
                                    onClick={() => saveRowReview(row)}
                                  >
                                    {reviewSaving ? t('loading') : t('fieldDeliveryRecapReviewSave')}
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {editable ? (
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
            ) : (
              <p className="text-[15px] text-apple-label">{t('fieldDeliveryRecapFilterNoMatch')}</p>
            )}
          </>
        ) : (
          <p className="text-[15px] text-apple-label">{t('fieldDeliveryEmpty')}</p>
        )}
      </Card>
    </>
  );
}
