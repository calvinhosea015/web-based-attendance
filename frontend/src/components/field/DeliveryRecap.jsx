import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, inputClass } from '../ui.jsx';
import { api, paths, ensureCsrf } from '../../api/client.js';
import { translateApiMessage } from '../../translateApi.js';
import { useNotify } from '../../hooks/useNotify.js';
import { fieldDeliveryDisplayFields } from '../../utils/fieldCheckout.js';
import { formatDisplayDate } from '../../utils/formatDate.js';
import { formatIdr } from '../../utils/payrollDisplay.js';

/**
 * @param {{ editable?: boolean }} props
 */
export default function DeliveryRecap({ editable = false }) {
  const { t } = useTranslation();
  const [notification, notify, dismiss] = useNotify();

  const [allDeliveries, setAllDeliveries] = useState([]);
  const [recapLoading, setRecapLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadAllDeliveries = useCallback(async () => {
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
  }, [t, notify]);

  useEffect(() => {
    loadAllDeliveries();
  }, [loadAllDeliveries]);

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
          </>
        ) : (
          <p className="text-[15px] text-apple-label">{t('fieldDeliveryEmpty')}</p>
        )}
      </Card>
    </>
  );
}
