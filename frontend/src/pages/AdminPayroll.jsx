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
} from '../utils/payrollPeriod.js';

function formatIdr(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

export default function AdminPayroll() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [period, setPeriod] = useState(currentPayrollPeriodKey());
  const [periodCycleLabel, setPeriodCycleLabel] = useState(() => payrollCycleLabel(currentPayrollPeriodKey()));
  const [settings, setSettings] = useState({ transport_amount: 250000, diligence_amount: 100000 });
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [exportingSlips, setExportingSlips] = useState(false);

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

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('role') !== 'admin') {
      navigate('/login');
      return;
    }
    loadPeriod();
  }, [navigate, loadPeriod]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    notify('');
    try {
      await ensureCsrf();
      const { data } = await api.put(paths.adminPayrollSettings, {
        transport_amount: Number(settings.transport_amount),
        diligence_amount: Number(settings.diligence_amount),
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
      const { data } = await api.post(paths.adminPayrollGenerate(period));
      setSettings(data.settings || settings);
      setRows(data.rows || []);
      notify(t('payrollGenerated', { count: data.generated ?? 0 }), 'success');
    } catch (err) {
      notify(translateApiMessage(err) || String(err), 'error');
    } finally {
      setGenerating(false);
    }
  };

  const openEdit = (row) => {
    setEditingId(row.employee_id);
    setEditForm({
      days_attended: row.days_attended ?? 0,
      upah_harian: row.upah_harian ?? row.employee_upah_harian ?? 0,
      tunjangan_masa_kerja: row.tunjangan_masa_kerja ?? 0,
      transport_eligible: Boolean(row.transport_eligible),
      overtime_pay: row.overtime_pay ?? 0,
      insentif: row.insentif ?? 0,
      diligence_eligible: Boolean(row.diligence_eligible),
      bonus_omset: row.bonus_omset ?? 0,
      loan_deduction: Math.max(
        Number(row.loan_deduction || 0),
        Number(row.loan_deduction_preview || 0)
      ),
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
      const { data } = await api.put(paths.adminPayrollEntry(period, editingId), editForm);
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

  return (
    <AdminLayout
      title={t('payrollTitle')}
      subtitle={t('payrollSubtitle')}
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
                <Button type="submit" variant="primary" disabled={savingSettings}>
                  {savingSettings ? t('loading') : t('payrollSaveSettings')}
                </Button>
              </form>
            </Card>
          </div>

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
                      <td className="px-4 py-3 text-right tabular-nums">{row.days_attended ?? 0}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {formatIdr(row.upah_harian)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="tabular-nums font-medium text-slate-900">
                          {formatIdr(row.basic_salary)}
                        </div>
                        <div className="text-xs text-slate-400">
                          {row.days_attended ?? 0} × {formatIdr(row.upah_harian)}
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
            <CompactField label={t('payrollDaysAttended')}>
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
            <CompactField label={t('payrollUpahHarian')}>
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
            <div className="rounded-md border border-brand-100 bg-brand-50/60 px-2 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">
                {t('payrollBasicSalary')}
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                Rp{' '}
                {formatIdr(
                  Math.max(0, Math.floor(editForm.days_attended || 0)) *
                    Number(editForm.upah_harian || 0)
                )}
              </p>
            </div>
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
            <CompactField label={t('payrollBonusOmset')}>
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
            <CompactField label={t('payrollLoanDeduction')} hint={t('payrollLoanDeductionHint')}>
              <input
                type="number"
                min="0"
                className={`${inputClassCompact} bg-slate-50`}
                value={editForm.loan_deduction}
                readOnly
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
            {editingRow?.has_active_loan && (
              <p className="col-span-2 text-[10px] text-amber-700 md:col-span-4">
                {t('payrollActiveLoanHint', {
                  monthly: formatIdr(editingRow.loan_monthly_deduction),
                  remaining: formatIdr(editingRow.loan_remaining_balance),
                })}
              </p>
            )}
          </form>
        </Modal>
      )}
    </AdminLayout>
  );
}
