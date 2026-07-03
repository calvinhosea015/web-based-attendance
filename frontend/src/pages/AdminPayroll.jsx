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
import { isMonthlyPayrollMode } from '../roles.js';
import {
  currentPayrollPeriodKey,
  payrollCycleLabel,
  periodLabelCalendar,
  countWorkingDaysMonSatInCycle,
  previewMonthlyStaffPayroll,
} from '../utils/payrollPeriod.js';
import { resolveUpahHarianDisplay, formatIdr } from '../utils/payrollDisplay.js';

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

  const loadPeriod = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
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
      if (!silent) {
        notify(translateApiMessage(err) || String(err), 'error');
        setRows([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setPeriodCycleLabel(payrollCycleLabel(period));
  }, [period]);

  useEffect(() => {
    loadPeriod();
  }, [loadPeriod]);

  const PAYROLL_POLL_MS = 30000;

  useEffect(() => {
    if (editingId != null) return undefined;

    const refreshSilent = () => loadPeriod({ silent: true });
    const intervalId = setInterval(refreshSilent, PAYROLL_POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshSilent();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [period, editingId, loadPeriod]);

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
    const isMonthlyMode = isMonthlyPayrollMode(mode);
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
      const isMonthlyMode = isMonthlyPayrollMode(editForm.payroll_mode);
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
  const editIsMonthly = isMonthlyPayrollMode(editForm?.payroll_mode);
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
        <Button
          variant="secondary"
          onClick={handleExportAllSlips}
          disabled={exportingSlips || rows.length === 0}
        >
          {exportingSlips ? t('loading') : t('payrollExportAllSlips')}
        </Button>
      }
    >
      <div className="space-y-6">
        {message && (
          <Alert tone={messageTone} onDismiss={() => notify('')}>
            {message}
          </Alert>
        )}

        <p className="text-xs text-apple-label">{t('deployUiStaleHint')}</p>

        {payrollHolidays.length > 0 && (
          <p className="text-sm text-apple-label">
            {t('payrollHolidaysExcluded', { count: payrollHolidays.length })}
            {requiredWorkDays != null && (
              <span className="text-apple-label">
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

          <Card className="flex flex-col" title={t('payrollEmployeeTable')}>
            <div className="-mx-5 -mb-4 max-h-[min(65vh,calc(100vh-16rem))] overflow-auto sm:-mx-6">
              <table className="apple-table">
                <thead className="sticky top-0 z-10">
                  <tr className="apple-table-head !bg-apple-fill">
                    <th>{t('employee')}</th>
                    <th className="text-right">{t('payrollDaysAttended')}</th>
                    <th className="text-right">{t('payrollUpahHarian')}</th>
                    <th className="text-right">{t('payrollBasicSalary')}</th>
                    <th className="text-right">{t('payrollLoanDeduction')}</th>
                    <th className="text-right">{t('payrollFinal')}</th>
                    <th className="text-right">{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr className="apple-table-row">
                      <td colSpan={7} className="!py-12 text-center text-apple-label">
                        {loading ? t('loading') : t('payrollNoRows')}
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr key={row.employee_id} className="apple-table-row">
                      <td>
                        <div className="font-medium text-apple-text">{row.full_name}</div>
                        <div className="text-[12px] text-apple-label">{row.employee_code}</div>
                        {row.has_active_loan && (
                          <div className="mt-1 text-[12px] text-amber-700">
                            {t('payrollActiveLoanHint', {
                              monthly: formatIdr(row.loan_monthly_deduction),
                              remaining: formatIdr(row.loan_remaining_balance),
                            })}
                          </div>
                        )}
                        {row.keterangan ? (
                          <div className="mt-1 text-xs text-apple-label">
                            <span className="font-medium text-apple-label">{t('payrollKeterangan')}:</span>{' '}
                            {row.keterangan}
                          </div>
                        ) : null}
                      </td>
                      <td className="text-right tabular-nums">
                        {row.payroll_mode === 'monthly' ||
                        isMonthlyPayrollMode(row.payroll_mode) ||
                        row.payroll_mode === 'accounting' ? (
                          <div>
                            <div>{row.days_attended ?? 0}</div>
                            {row.payroll_mode === 'monthly' ||
                            isMonthlyPayrollMode(row.payroll_mode) ||
                            row.payroll_mode === 'accounting' ? (
                              <div className="text-xs text-apple-muted">
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
                      <td className="text-right tabular-nums text-apple-label">
                        {row.payroll_mode === 'manual' ? (
                          <div className="text-xs text-apple-muted">{t('payrollManualMode')}</div>
                        ) : row.payroll_mode === 'monthly' ||
                          isMonthlyPayrollMode(row.payroll_mode) ||
                          row.payroll_mode === 'accounting' ? (
                          <div>
                            <div>{formatIdr(row.monthly_basic_gross ?? row.employee_basic_salary)}</div>
                            <div className="text-xs text-apple-muted">{t('payrollMonthlyBasic')}</div>
                          </div>
                        ) : (
                          formatIdr(resolveUpahHarianDisplay(row, settings))
                        )}
                      </td>
                      <td className="text-right">
                        <div className="tabular-nums font-medium text-apple-text">
                          {formatIdr(row.basic_salary)}
                        </div>
                        <div className="text-xs text-apple-muted">
                          {row.payroll_mode === 'manual'
                            ? t('payrollManualMode')
                            : row.payroll_mode === 'monthly' ||
                                isMonthlyPayrollMode(row.payroll_mode) ||
                                row.payroll_mode === 'accounting'
                              ? t('payrollAbsenceDeduction') +
                                `: Rp ${formatIdr(row.absence_deduction ?? 0)}`
                              : `${row.days_attended ?? 0} × ${formatIdr(resolveUpahHarianDisplay(row, settings))}`}
                        </div>
                      </td>
                      <td className="text-right tabular-nums text-rose-600">
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
                      <td className="text-right tabular-nums font-semibold text-brand-600">
                        {formatIdr(row.final_salary)}
                      </td>
                      <td>
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
              <p className="col-span-2 text-[10px] text-apple-label md:col-span-4">
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
                <div className="rounded-apple-lg border border-brand-100 bg-brand-50/60 px-2.5 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">
                    {t('payrollMonthlyNetBasic')}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-apple-text">
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
                <p className="col-span-2 text-[10px] text-apple-label md:col-span-4">
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
                <div className="rounded-apple-lg border border-black/[0.06] bg-apple-fill px-2.5 py-2 text-[12px] text-apple-label">
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

            <p className="col-span-2 mt-1 text-[10px] font-semibold uppercase tracking-wide text-apple-label md:col-span-4">
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
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-apple-text">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={editForm.transport_eligible}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, transport_eligible: e.target.checked }))
                  }
                />
                {t('payrollTransportEligible')}
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-apple-text">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={editForm.diligence_eligible}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, diligence_eligible: e.target.checked }))
                  }
                />
                {t('payrollDiligenceEligible')}
              </label>
            </div>

            <p className="col-span-2 mt-1 text-[10px] font-semibold uppercase tracking-wide text-apple-label md:col-span-4">
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
