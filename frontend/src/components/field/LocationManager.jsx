import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, Field, inputClass } from '../ui.jsx';
import { api, paths, ensureCsrf } from '../../api/client.js';
import { translateApiMessage } from '../../translateApi.js';
import { useNotify } from '../../hooks/useNotify.js';

export default function LocationManager() {
  const { t } = useTranslation();
  const [notification, notify, dismiss] = useNotify();

  const [offices, setOffices] = useState([]);
  const [newOffice, setNewOffice] = useState({ name: '', locationLink: '' });
  const [editingOffice, setEditingOffice] = useState(null);
  const [officeSaving, setOfficeSaving] = useState(false);
  // ponytail: fetched independently for linked-factory display only
  const [pabriks, setPabriks] = useState([]);

  const loadOffices = useCallback(async () => {
    try {
      const { data } = await api.get(paths.offices);
      setOffices(Array.isArray(data) ? data : []);
    } catch {
      setOffices([]);
    }
  }, []);

  const loadPabriks = useCallback(async () => {
    try {
      const { data } = await api.get(paths.adminPabriks);
      setPabriks(Array.isArray(data?.pabriks) ? data.pabriks : []);
    } catch {
      setPabriks([]);
    }
  }, []);

  useEffect(() => { loadOffices(); }, [loadOffices]);
  useEffect(() => { loadPabriks(); }, [loadPabriks]);

  const sortedOffices = useMemo(
    () =>
      [...offices].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
      ),
    [offices]
  );

  const handleAddOffice = async (e) => {
    e.preventDefault();
    setOfficeSaving(true);
    dismiss();
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
    )
      return;
    dismiss();
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
    dismiss();
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

  return (
    <section id="location-management" className="scroll-mt-24">
      {notification && (
        <Alert tone={notification.tone} onDismiss={dismiss}>
          {notification.text}
        </Alert>
      )}
      <Card title={t('locationManagement')} description={t('locationManagementHint')}>
        <form
          className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
          onSubmit={handleAddOffice}
        >
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
  );
}
