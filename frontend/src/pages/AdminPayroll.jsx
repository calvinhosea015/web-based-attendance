import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AdminLayout from '../components/AdminLayout.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Modal,
  StatTile,
  CompactField,
  inputClass,
  inputClassCompact,
} from '../components/ui.jsx';
import { api, paths, ensureCsrf, downloadBlobResponse } from '../api/client.js';
import { translateApiMessage } from '../translateApi.js';
import {
  currentPayrollPeriodKey,
  payrollCycleLabel,
  periodLabelCalendar,
  countWorkingDaysMonSatInCycle,
  previewMonthlyStaffPayroll,
} from '../utils/payrollPeriod.js';
import { resolveUpahHarianDisplay } from '../utils/payrollDisplay.js';

function formatIdr(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

const UI_BUILD_SHA = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev';

function apiHostForHealth() {
  const base = String(import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '');
  if (base.endsWith('/api')) return base.slice(0, -4) || '';
  if (/^https?:\/\//i.test(base)) {
    try {
      return new URL(base).origin;
    } catch {
      return '';
    }
  }
  return '';
}

export default function AdminPayroll() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [period, setPeriod] = useState(currentPayrollPeriodKey());
  const [periodCycleLabel, setPeriodCycleLabel] = useState(() => payrollCycleLabel(currentPayrollPeriodKey()));
  const [settings, setSettings] = useState({
    transport_amount: 250000,
    diligence_amount: 100000,
    default_upah_harian: 0,
  });
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [exportingSlips, setExportingSlips] = useState(false);
  const [requiredWorkDays, setRequiredWorkDays] = useState(null);
  const [payrollHolidays, setPayrollHolidays] = useState([]);
  const [manualRequiredDays, setManualRequiredDays] = useState('');
  const [apiBuildSha, setApiBuildSha] = useState(null);
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

  const notify = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const slipDownloadFilename = (fullName) => {
    const name = String(fullName || 'Karyawan')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ');
    return `Attendance Slip Gaji (${name}).xlsx`;
  };

  const handleExportSlip = async (employeeId, fullName) => {
    notify('');
    try {
      await ensureCsrf();
      const res = await api.post(
        paths.adminPayrollSlip(period, employeeId),
        {},
        { responseType: 'blob' }
      );
      downloadBlobResponse(res, slipDownloadFilename(fullName));
      notify(t('payrollSlipExported'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    }
  };

  const handleExportAllSlips = async () => {
    setExportingSlips(true);
    notify('');
    try {
      await ensureCsrf();
      const res = await api.post(paths.adminPayrollSlipsAll(period), {}, { responseType: 'blob' });
      downloadBlobResponse(res, `slip_gaji_semua_${period.replace('-', '')}.xlsx`);
      notify(t('payrollAllSlipsExported'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setExportingSlips(false);
    }
  };

  const loadPeriod = useCallback(async () => {
    setLoading(true);
    notify('');
    try {
      await ensureCsrf();
      const { data } = await api.get(paths.adminPayrollPeriod(period));
      setSettings(data.settings || settings);
      setRows(data.rows || []);
      setRequiredWorkDays(
        data.required_work_days != null ? Number(data.required_work_days) : null
      );
      setManualRequiredDays(
        data.required_work_days != null ? String(Number(data.required_work_days)) : ''
      );
      setPayrollHolidays(Array.isArray(data.payroll_holidays) ? data.payroll_holidays : []);
      if (data.period_cycle_label) setPeriodCycleLabel(data.period_cycle_label);
      else setPeriodCycleLabel(payrollCycleLabel(period));
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setPeriodCycleLabel(payrollCycleLabel(period));
  }, [period]);

  const loadPabriks = useCallback(async () => {
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
    } catch {
      setPabriks([]);
      setPabrikRates([]);
      setPabrikMapsDraft({});
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('role') !== 'admin') {
      navigate('/login');
      return;
    }
    loadPeriod();
    loadPabriks();
  }, [navigate, loadPeriod, loadPabriks]);

  useEffect(() => {
    const host = apiHostForHealth();
    if (!host) return;
    fetch(`${host}/health`)
      .then((r) => r.json())
      .then((data) => {
        const sha = data?.commit ? String(data.commit).slice(0, 7) : null;
        setApiBuildSha(sha);
      })
      .catch(() => setApiBuildSha(null));
  }, []);

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

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    notify('');
    try {
      await ensureCsrf();
      const { data } = await api.put(paths.adminPayrollSettings, {
        transport_amount: Number(settings.transport_amount),
        diligence_amount: Number(settings.diligence_amount),
        default_upah_harian: Number(settings.default_upah_harian),
      });
      setSettings(data);
      notify(t('payrollSettingsSaved'), 'success');
      await loadPeriod();
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    notify('');
    try {
      await ensureCsrf();
      const payload = {};
      if (manualRequiredDays !== '') payload.required_work_days = Number(manualRequiredDays);
      const { data } = await api.post(paths.adminPayrollGenerate(period), payload);
      setSettings(data.settings || settings);
      setRows(data.rows || []);
      setRequiredWorkDays(
        data.required_work_days != null ? Number(data.required_work_days) : null
      );
      setManualRequiredDays(
        data.required_work_days != null ? String(Number(data.required_work_days)) : ''
      );
      setPayrollHolidays(Array.isArray(data.payroll_holidays) ? data.payroll_holidays : []);
      notify(t('payrollGenerated', { count: data.generated ?? 0 }), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setGenerating(false);
    }
  };

  const openEdit = (row) => {
    const mode = row.payroll_mode || 'daily';
    const isMonthlyMode =
      mode === 'monthly' || mode === 'general_affairs' || mode === 'accounting';
    const monthlyGross =
      row.monthly_basic_gross ?? row.employee_basic_salary ?? row.basic_salary ?? 0;
    const expectedDefault =
      row.expected_work_days ?? requiredWorkDays ?? countWorkingDaysMonSatInCycle(period);
    const daysAttended = row.days_attended ?? 0;
    const upah = resolveUpahHarianDisplay(row, settings);
    let absenceDeduction = Number(row.absence_deduction ?? 0);
    if (row.absence_deduction == null) {
      if (isMonthlyMode) {
        absenceDeduction =
          previewMonthlyStaffPayroll({
            monthlyBasic: monthlyGross,
            expectedDays: expectedDefault,
            daysAttended,
          }).absenceDeduction ?? 0;
      } else if (row.user_role === 'field_officer') {
        absenceDeduction = Math.max(0, expectedDefault - daysAttended) * upah;
      }
    }
    setEditingId(row.employee_id);
    setEditForm({
      payroll_mode: mode,
      days_attended: daysAttended,
      expected_work_days: expectedDefault,
      monthly_basic_gross: monthlyGross,
      upah_harian: upah,
      basic_salary: row.basic_salary ?? 0,
      absence_deduction: absenceDeduction,
      tunjangan_masa_kerja: row.tunjangan_masa_kerja ?? 0,
      transport_eligible: Boolean(row.transport_eligible),
      transport_allowance_amount: Number(row.transport_allowance ?? 0),
      overtime_pay: row.overtime_pay ?? 0,
      insentif: row.insentif ?? 0,
      diligence_eligible: Boolean(row.diligence_eligible),
      diligence_allowance_amount: Number(row.diligence_bonus ?? 0),
      bonus_omset: row.bonus_omset ?? 0,
      loan_deduction: Math.max(
        Number(row.loan_deduction || 0),
        Number(row.loan_deduction_preview || 0)
      ),
      late_deduction: row.late_deduction ?? 0,
      bpjs_tk: row.bpjs_tk ?? 0,
      bpjs_kes: row.bpjs_kes ?? 0,
      pph_21: row.pph_21 ?? 0,
      other_deductions: row.other_deductions ?? row.deductions ?? 0,
      keterangan: row.keterangan ?? '',
    });
  };

  const handleSaveRow = async (e) => {
    e.preventDefault();
    if (!editingId) return;
    notify('');
    try {
      await ensureCsrf();
      const payload = { ...editForm };
      delete payload.payroll_mode;
      const isMonthlyMode =
        editForm.payroll_mode === 'monthly' ||
        editForm.payroll_mode === 'general_affairs' ||
        editForm.payroll_mode === 'accounting';
      if (isMonthlyMode || editForm.payroll_mode === 'manual') {
        delete payload.upah_harian;
      }
      if (!isMonthlyMode) {
        delete payload.monthly_basic_gross;
      }
      if (editForm.payroll_mode === 'manual') {
        delete payload.monthly_basic_gross;
        delete payload.absence_deduction;
        delete payload.expected_work_days;
      }
      const rowRole = rows.find((r) => r.employee_id === editingId)?.user_role;
      if (!isMonthlyMode && rowRole !== 'field_officer') {
        delete payload.absence_deduction;
        delete payload.expected_work_days;
      }
      const { data } = await api.put(paths.adminPayrollEntry(period, editingId), payload);
      setRows((prev) => prev.map((r) => (r.employee_id === data.employee_id ? { ...r, ...data } : r)));
      setEditingId(null);
      setEditForm(null);
      notify(t('payrollRowSaved'), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    }
  };

  const totals = useMemo(() => {
    const count = rows.length;
    const payrollSum = rows.reduce((s, r) => s + Number(r.final_salary || 0), 0);
    const daysSum = rows.reduce((s, r) => s + Number(r.days_attended || 0), 0);
    return { count, payrollSum, daysSum };
  }, [rows]);

  const editingRow = rows.find((r) => r.employee_id === editingId);
  const editIsManual = editForm?.payroll_mode === 'manual';
  const editIsMonthly =
    editForm?.payroll_mode === 'monthly' ||
    editForm?.payroll_mode === 'general_affairs' ||
    editForm?.payroll_mode === 'accounting';
  const editIsFieldOfficer = editingRow?.user_role === 'field_officer';
  const editShowsExpectedDays = editIsMonthly || editIsFieldOfficer;

  const deploySubtitle = [
    t('payrollSubtitle'),
    `${t('deployUiBuild')}: ${UI_BUILD_SHA}`,
    apiBuildSha ? `${t('deployApiBuild')}: ${apiBuildSha}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <AdminLayout
      title={t('payrollTitle')}
      subtitle={deploySubtitle}
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() => navigate(`/finance/field-omset?period=${period}`)}
          >
            {t('fieldOmsetReportTitle')}
          </Button>
          <Button
            variant="secondary"
            onClick={handleExportAllSlips}
            disabled={exportingSlips || rows.length === 0}
          >
            {exportingSlips ? t('loading') : t('payrollExportAllSlips')}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {message && (
          <Alert tone={messageTone} onDismiss={() => notify('')}>
            {message}
          </Alert>
        )}

        <p className="text-xs text-slate-500">{t('deployUiStaleHint')}</p>

        {payrollHolidays.length > 0 && (
          <p className="text-sm text-slate-600">
            {t('payrollHolidaysExcluded', { count: payrollHolidays.length })}
            {requiredWorkDays != null && (
              <span className="text-slate-500">
                {' '}
                · {t('payrollExpectedWorkDays')}: {requiredWorkDays}
              </span>
            )}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile
            label={t('payrollMonth')}
            value={periodLabelCalendar(period)}
            sub={periodCycleLabel || payrollCycleLabel(period)}
          />
          <StatTile
            label={t('totalEmployees')}
            value={totals.count}
            sub={t('payrollEmployeeTable')}
          />
          <StatTile
            label={t('payrollFinal')}
            value={`Rp ${formatIdr(totals.payrollSum)}`}
            sub={`${totals.daysSum} ${t('payrollDaysAttended').toLowerCase()}`}
          />
        </div>

        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={t('payrollPeriod')} description={t('payrollGenerateHint')}>
              <div className="space-y-4">
                <Field label={t('payrollMonth')}>
                  <input
                    type="month"
                    className={inputClass}
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  />
                </Field>
                <Field label={t('payrollExpectedWorkDaysManual')}>
                  <input
                    type="number"
                    min="0"
                    max="31"
                    className={inputClass}
                    value={manualRequiredDays}
                    onChange={(e) => setManualRequiredDays(e.target.value)}
                    placeholder={String(requiredWorkDays ?? countWorkingDaysMonSatInCycle(period))}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={loadPeriod} disabled={loading}>
                    {loading ? t('loading') : t('payrollRefresh')}
                  </Button>
                  <Button variant="success" onClick={handleGenerate} disabled={generating}>
                    {generating ? t('loading') : t('payrollGenerate')}
                  </Button>
                </div>
              </div>
            </Card>

            <Card title={t('payrollGlobalSettings')}>
              <form className="space-y-4" onSubmit={handleSaveSettings}>
                <Field label={t('payrollTransportNominal')}>
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={settings.transport_amount ?? ''}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, transport_amount: e.target.value }))
                    }
                  />
                </Field>
                <Field label={t('payrollDiligenceNominal')}>
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={settings.diligence_amount ?? ''}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, diligence_amount: e.target.value }))
                    }
                  />
                </Field>
                <Field
                  label={t('payrollDefaultUpahHarian')}
                  hint={t('payrollDefaultUpahHarianHint')}
                >
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={settings.default_upah_harian ?? ''}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, default_upah_harian: e.target.value }))
                    }
                  />
                </Field>
                <Button type="submit" variant="primary" disabled={savingSettings}>
                  {savingSettings ? t('loading') : t('payrollSaveSettings')}
                </Button>
              </form>
            </Card>
          </div>

          <Card title={t('pabrikCatalogTitle')} description={t('pabrikCatalogHint')}>
            {pabriks.length === 0 ? (
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
                  list="pabrik-kode-barang-options"
                  value={pabrikForm.kode_barang}
                  onChange={(e) =>
                    setPabrikForm((f) => ({ ...f, kode_barang: e.target.value }))
                  }
                  required
                />
                <datalist id="pabrik-kode-barang-options">
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
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
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

          <Card className="flex flex-col" title={t('payrollEmployeeTable')}>
            <div className="-mx-5 -mb-4 max-h-[min(65vh,calc(100vh-16rem))] overflow-auto sm:-mx-6">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226,232,240)]">
                    <th className="px-4 py-3">{t('employee')}</th>
                    <th className="px-4 py-3 text-right">{t('payrollDaysAttended')}</th>
                    <th className="px-4 py-3 text-right">{t('payrollUpahHarian')}</th>
                    <th className="px-4 py-3 text-right">{t('payrollBasicSalary')}</th>
                    <th className="px-4 py-3 text-right">{t('payrollLoanDeduction')}</th>
                    <th className="px-4 py-3 text-right">{t('payrollFinal')}</th>
                    <th className="px-4 py-3 text-right">{t('status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                        {loading ? t('loading') : t('payrollNoRows')}
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr key={row.employee_id} className="transition hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{row.full_name}</div>
                        <div className="text-xs text-slate-500">{row.employee_code}</div>
                        {row.has_active_loan && (
                          <div className="mt-1 text-xs text-amber-700">
                            {t('payrollActiveLoanHint', {
                              monthly: formatIdr(row.loan_monthly_deduction),
                              remaining: formatIdr(row.loan_remaining_balance),
                            })}
                          </div>
                        )}
                        {row.keterangan ? (
                          <div className="mt-1 text-xs text-slate-600">
                            <span className="font-medium text-slate-500">{t('payrollKeterangan')}:</span>{' '}
                            {row.keterangan}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.payroll_mode === 'monthly' ||
                        row.payroll_mode === 'general_affairs' ||
                        row.payroll_mode === 'accounting' ? (
                          <div>
                            <div>{row.days_attended ?? 0}</div>
                            {row.payroll_mode === 'monthly' ||
                            row.payroll_mode === 'general_affairs' ||
                            row.payroll_mode === 'accounting' ? (
                              <div className="text-xs text-slate-400">
                                /{' '}
                                {row.expected_work_days ??
                                  requiredWorkDays ??
                                  countWorkingDaysMonSatInCycle(period)}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          row.days_attended ?? 0
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {row.payroll_mode === 'manual' ? (
                          <div className="text-xs text-slate-400">{t('payrollManualMode')}</div>
                        ) : row.payroll_mode === 'monthly' ||
                          row.payroll_mode === 'general_affairs' ||
                          row.payroll_mode === 'accounting' ? (
                          <div>
                            <div>{formatIdr(row.monthly_basic_gross ?? row.employee_basic_salary)}</div>
                            <div className="text-xs text-slate-400">{t('payrollMonthlyBasic')}</div>
                          </div>
                        ) : (
                          formatIdr(resolveUpahHarianDisplay(row, settings))
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="tabular-nums font-medium text-slate-900">
                          {formatIdr(row.basic_salary)}
                        </div>
                        <div className="text-xs text-slate-400">
                          {row.payroll_mode === 'manual'
                            ? t('payrollManualMode')
                            : row.payroll_mode === 'monthly' ||
                                row.payroll_mode === 'general_affairs' ||
                                row.payroll_mode === 'accounting'
                              ? t('payrollAbsenceDeduction') +
                                `: Rp ${formatIdr(row.absence_deduction ?? 0)}`
                              : `${row.days_attended ?? 0} × ${formatIdr(resolveUpahHarianDisplay(row, settings))}`}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600">
                        <div>{formatIdr(row.loan_deduction)}</div>
                        {row.has_active_loan &&
                          Number(row.loan_deduction || 0) === 0 &&
                          Number(row.loan_deduction_preview || 0) > 0 && (
                            <div className="text-xs font-normal text-amber-600">
                              {t('payrollLoanPreview', {
                                amount: formatIdr(row.loan_deduction_preview),
                              })}
                            </div>
                          )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-brand-600">
                        {formatIdr(row.final_salary)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="secondary" size="sm" onClick={() => openEdit(row)}>
                            {t('editUser')}
                          </Button>
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => handleExportSlip(row.employee_id, row.full_name)}
                          >
                            {t('payrollExportSlip')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {editingId && editForm && (
        <Modal
          size="xl"
          fitScreen
          title={t('payrollEditRow')}
          subtitle={editingRow?.full_name}
          onClose={() => {
            setEditingId(null);
            setEditForm(null);
          }}
          footer={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditingId(null);
                  setEditForm(null);
                }}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" form="payroll-edit-form" variant="primary" size="sm">
                {t('saveUser')}
              </Button>
            </>
          }
        >
          <form
            id="payroll-edit-form"
            className="grid grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-4"
            onSubmit={handleSaveRow}
          >
            {editIsManual && (
              <p className="col-span-2 text-[10px] text-slate-500 md:col-span-4">
                {t('payrollManualHint')}
              </p>
            )}
            <CompactField
              label={t('payrollDaysAttended')}
              hint={editIsManual ? t('payrollDaysManual') : t('payrollDaysEditableHint')}
            >
              <input
                type="number"
                min="0"
                className={inputClassCompact}
                value={editForm.days_attended}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, days_attended: Number(e.target.value) }))
                }
              />
            </CompactField>
            {editShowsExpectedDays && (
              <CompactField label={t('payrollExpectedWorkDaysSlip')}>
                <input
                  type="number"
                  min="0"
                  className={inputClassCompact}
                  value={editForm.expected_work_days ?? ''}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      expected_work_days: Number(e.target.value),
                    }))
                  }
                />
              </CompactField>
            )}
            {editIsManual ? (
              <CompactField label={t('payrollSlipGaji')} className="col-span-2 md:col-span-2">
                <input
                  type="number"
                  min="0"
                  className={inputClassCompact}
                  value={editForm.basic_salary}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, basic_salary: Number(e.target.value) }))
                  }
                />
              </CompactField>
            ) : editIsMonthly ? (
              <>
                <CompactField label={t('payrollSlipGaji')}>
                  <input
                    type="number"
                    min="0"
                    className={inputClassCompact}
                    value={editForm.monthly_basic_gross}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        monthly_basic_gross: Number(e.target.value),
                      }))
                    }
                  />
                </CompactField>
                <div className="rounded-md border border-brand-100 bg-brand-50/60 px-2 py-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">
                    {t('payrollMonthlyNetBasic')}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                    Rp{' '}
                    {formatIdr(
                      Math.max(
                        0,
                        Number(editForm.monthly_basic_gross || 0) -
                          Number(editForm.absence_deduction || 0)
                      )
                    )}
                  </p>
                </div>
                <p className="col-span-2 text-[10px] text-slate-500 md:col-span-4">
                  {editForm.payroll_mode === 'accounting'
                    ? t('payrollAccountingHint')
                    : t('payrollMonthlyFormula')}
                </p>
              </>
            ) : (
              <>
                <CompactField
                  label={t('payrollSlipGaji')}
                  hint={editIsFieldOfficer ? t('payrollUpahHarianHint') : undefined}
                >
                  <input
                    type="number"
                    min="0"
                    className={inputClassCompact}
                    value={editForm.upah_harian}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, upah_harian: Number(e.target.value) }))
                    }
                  />
                </CompactField>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                  <p>
                    {t('payrollDaysAttended')}: {editForm.days_attended ?? 0}
                  </p>
                  <p>
                    {t('payrollBasicSalary')}: Rp{' '}
                    {formatIdr(
                      Math.max(0, Math.floor(editForm.days_attended || 0)) *
                        Number(editForm.upah_harian || 0)
                    )}
                  </p>
                </div>
              </>
            )}

            <p className="col-span-2 mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:col-span-4">
              {t('payrollSlipEarnings')}
            </p>
            <CompactField label={t('payrollTunjanganMasaKerja')}>
              <input
                type="number"
                min="0"
                className={inputClassCompact}
                value={editForm.tunjangan_masa_kerja}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, tunjangan_masa_kerja: Number(e.target.value) }))
                }
              />
            </CompactField>
            <CompactField label={t('payrollTransportAmount')}>
              <input
                type="number"
                min="0"
                className={inputClassCompact}
                value={editForm.transport_allowance_amount}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    transport_allowance_amount: Number(e.target.value),
                  }))
                }
              />
            </CompactField>
            <CompactField label={t('payrollLembur')}>
              <input
                type="number"
                min="0"
                className={inputClassCompact}
                value={editForm.overtime_pay}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, overtime_pay: Number(e.target.value) }))
                }
              />
            </CompactField>
            <CompactField label={t('payrollInsentif')}>
              <input
                type="number"
                min="0"
                className={inputClassCompact}
                value={editForm.insentif}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, insentif: Number(e.target.value) }))
                }
              />
            </CompactField>
            <CompactField label={t('payrollDiligenceAmount')}>
              <input
                type="number"
                min="0"
                className={inputClassCompact}
                value={editForm.diligence_allowance_amount}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    diligence_allowance_amount: Number(e.target.value),
                  }))
                }
              />
            </CompactField>
            <CompactField
              label={t('payrollBonusOmset')}
              hint={editIsFieldOfficer ? t('payrollBonusFieldOfficerHint') : undefined}
            >
              <input
                type="number"
                min="0"
                className={inputClassCompact}
                value={editForm.bonus_omset}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, bonus_omset: Number(e.target.value) }))
                }
              />
            </CompactField>
            <div className="col-span-2 flex flex-wrap items-center gap-4 md:col-span-4">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={editForm.transport_eligible}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, transport_eligible: e.target.checked }))
                  }
                />
                {t('payrollTransportEligible')}
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={editForm.diligence_eligible}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, diligence_eligible: e.target.checked }))
                  }
                />
                {t('payrollDiligenceEligible')}
              </label>
            </div>

            <p className="col-span-2 mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:col-span-4">
              {t('payrollSlipDeductions')}
            </p>
            {(editIsMonthly || editIsFieldOfficer) && (
              <CompactField label={t('payrollSlipPotonganAbsen')}>
                <input
                  type="number"
                  min="0"
                  className={inputClassCompact}
                  value={editForm.absence_deduction}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      absence_deduction: Number(e.target.value),
                    }))
                  }
                />
              </CompactField>
            )}
            <CompactField label={t('payrollLateDeduction')}>
              <input
                type="number"
                min="0"
                className={inputClassCompact}
                value={editForm.late_deduction}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, late_deduction: Number(e.target.value) }))
                }
              />
            </CompactField>
            <CompactField label={t('payrollBpjsTk')}>
              <input
                type="number"
                min="0"
                className={inputClassCompact}
                value={editForm.bpjs_tk}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, bpjs_tk: Number(e.target.value) }))
                }
              />
            </CompactField>
            <CompactField label={t('payrollBpjsKes')}>
              <input
                type="number"
                min="0"
                className={inputClassCompact}
                value={editForm.bpjs_kes}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, bpjs_kes: Number(e.target.value) }))
                }
              />
            </CompactField>
            <CompactField label={t('payrollPph21')}>
              <input
                type="number"
                min="0"
                className={inputClassCompact}
                value={editForm.pph_21}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, pph_21: Number(e.target.value) }))
                }
              />
            </CompactField>
            <CompactField
              label={t('payrollSlipKasbon')}
              hint={t('payrollLoanDeductionHint')}
            >
              <input
                type="number"
                min="0"
                className={inputClassCompact}
                value={editForm.loan_deduction}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, loan_deduction: Number(e.target.value) }))
                }
              />
            </CompactField>
            <CompactField label={t('payrollOtherDeductions')}>
              <input
                type="number"
                min="0"
                className={inputClassCompact}
                value={editForm.other_deductions}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, other_deductions: Number(e.target.value) }))
                }
              />
            </CompactField>
            {editingRow?.has_active_loan && (
              <p className="col-span-2 text-[10px] text-amber-700 md:col-span-4">
                {t('payrollActiveLoanHint', {
                  monthly: formatIdr(editingRow.loan_monthly_deduction),
                  remaining: formatIdr(editingRow.loan_remaining_balance),
                })}
              </p>
            )}
            <CompactField label={t('payrollKeterangan')} className="col-span-2 md:col-span-4">
              <input
                type="text"
                className={inputClassCompact}
                maxLength={500}
                placeholder={t('payrollKeteranganHint')}
                value={editForm.keterangan}
                onChange={(e) => setEditForm((f) => ({ ...f, keterangan: e.target.value }))}
              />
            </CompactField>
          </form>
        </Modal>
      )}
    </AdminLayout>
  );
}
