import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Card, Field, inputClass } from '../components/ui.jsx';
import LoanProgress from '../components/LoanProgress.jsx';
import { api, paths, ensureCsrf, rawApi } from '../api/client.js';
import i18n from '../i18n.js';
import { translateApiMessage, translateAttendanceStatus, translateRole } from '../translateApi.js';
import { isAttendanceRole } from '../roles.js';

function readPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error('unsupported'), { code: 0 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });
}

function formatApiError(err) {
  if (!err.response && (err.message === 'Network Error' || err.code === 'ERR_NETWORK')) {
    return i18n.t('apiUnreachable');
  }
  return translateApiMessage(err);
}

function geoMessage(err) {
  if (!err) return i18n.t('geoUnavailable');
  if (err.code === 0) return i18n.t('geoUnsupported');
  if (err.code === 1) return i18n.t('geoPermissionDenied');
  if (err.code === 2) return i18n.t('geoUnavailable');
  if (err.code === 3) return i18n.t('geoTimeout');
  return err.message || i18n.t('geoUnavailable');
}

function formatTimePart(t) {
  if (t == null) return '';
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export default function EmployeeDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [remoteWork, setRemoteWork] = useState(false);
  const [clockPending, setClockPending] = useState(false);
  const [checkoutCode, setCheckoutCode] = useState('');
  const [loans, setLoans] = useState([]);
  const [loanForm, setLoanForm] = useState({
    loan_amount: '',
    monthly_deduction: '',
    notes: '',
  });
  const [loanSubmitting, setLoanSubmitting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    if (!token) {
      navigate('/login');
      return;
    }
    if (role === 'admin') {
      navigate('/admin');
      return;
    }
    if (!isAttendanceRole(role)) {
      navigate('/login');
      return;
    }
    const load = async () => {
      try {
        await ensureCsrf();
      } catch (e) {
        setMessage(formatApiError(e));
        return;
      }
      try {
        const [s, h, ln] = await Promise.all([
          api.get(paths.employeeSummary),
          api.get(paths.employeeAttendance),
          api.get(paths.employeeLoans).catch(() => ({ data: [] })),
        ]);
        setSummary(s.data);
        setHistory(h.data);
        setLoans(ln.data || []);
      } catch (e) {
        console.error(e);
        setMessage((prev) => (prev ? `${prev} ${i18n.t('dashboardLoadFailed')}` : formatApiError(e)));
        if (e.response?.status === 401) navigate('/login');
      }
    };
    load();
  }, [navigate]);

  useEffect(() => {
    if (summary && summary.remote_work_allowed === false) {
      setRemoteWork(false);
    }
  }, [summary]);

  const refreshEmployee = async () => {
    try {
      const [s, h] = await Promise.all([
        api.get(paths.employeeSummary),
        api.get(paths.employeeAttendance),
      ]);
      setSummary(s.data);
      setHistory(h.data);
    } catch (e) {
      console.error(e);
      setMessage(formatApiError(e));
    }
  };

  const captureLocation = async () => {
    await ensureCsrf();
    let pos;
    try {
      pos = await readPosition();
    } catch (geoErr) {
      setMessage(geoMessage(geoErr));
      return null;
    }
    const { latitude, longitude, accuracy } = pos.coords;
    if (latitude == null || longitude == null || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      setMessage(i18n.t('geoUnavailable'));
      return null;
    }
    const client_ts_ms =
      typeof pos.timestamp === 'number' && pos.timestamp > 0 ? pos.timestamp : Date.now();
    return {
      lat: latitude,
      lng: longitude,
      accuracy_m: accuracy && accuracy > 0 ? accuracy : 25,
      client_ts_ms,
    };
  };

  const handleCheckIn = async () => {
    if (!summary?.assigned_office?.id) {
      setMessage(t('noOfficeAssigned'));
      return;
    }
    setMessage('');
    setClockPending(true);
    try {
      const loc = await captureLocation();
      if (!loc) return;
      await api.post(paths.checkIn, {
        ...loc,
        remote_work: summary?.remote_work_allowed !== false && remoteWork,
      });
      setMessage(t('checkedIn'));
      setCheckoutCode('');
      await refreshEmployee();
    } catch (err) {
      setMessage(formatApiError(err));
    } finally {
      setClockPending(false);
    }
  };

  const handleCheckOut = async () => {
    const isFieldOfficer = summary?.field_officer_mode === true;
    if (isFieldOfficer && !checkoutCode.trim()) {
      setMessage(t('checkoutCodeRequired'));
      return;
    }
    setMessage('');
    setClockPending(true);
    try {
      const loc = await captureLocation();
      if (!loc) return;
      const body = isFieldOfficer ? { ...loc, checkout_code: checkoutCode.trim() } : loc;
      await api.post(paths.checkOut, body);
      setMessage(t('checkedOut'));
      setCheckoutCode('');
      await refreshEmployee();
    } catch (err) {
      setMessage(formatApiError(err));
    } finally {
      setClockPending(false);
    }
  };

  const handleClock = async () => {
    const action = summary?.next_clock_action ?? 'check_in';
    if (action === 'check_out') await handleCheckOut();
    else if (action === 'check_in') await handleCheckIn();
  };

  const refreshLoans = async () => {
    try {
      const { data } = await api.get(paths.employeeLoans);
      setLoans(data || []);
    } catch {
      setLoans([]);
    }
  };

  const handleLoanSubmit = async (e) => {
    e.preventDefault();
    setLoanSubmitting(true);
    setMessage('');
    try {
      await ensureCsrf();
      await api.post(paths.employeeLoans, {
        loan_amount: Number(loanForm.loan_amount),
        monthly_deduction: Number(loanForm.monthly_deduction),
        notes: loanForm.notes || undefined,
      });
      setLoanForm({ loan_amount: '', monthly_deduction: '', notes: '' });
      setMessage(t('loanSubmitted'));
      await refreshLoans();
    } catch (err) {
      setMessage(formatApiError(err));
    } finally {
      setLoanSubmitting(false);
    }
  };

  const hasPendingLoan = loans.some((l) => l.approval_status === 'pending');

  const handleLogout = async () => {
    try {
      const rt = localStorage.getItem('refreshToken');
      if (rt) {
        await ensureCsrf();
        await rawApi.post(paths.logout, { refreshToken: rt });
      }
    } catch {
      /* ignore */
    }
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('role');
    navigate('/login');
  };

  const today = summary?.today;
  const assignedOffice = summary?.assigned_office;
  const canRemote = summary?.remote_work_allowed !== false;
  const canClockIn = Boolean(assignedOffice?.id);
  const isFieldOfficer = summary?.field_officer_mode === true;
  const nextAction = summary?.next_clock_action ?? 'check_in';
  const shift = summary?.shift;
  const shiftLabel = isFieldOfficer
    ? t('fieldOfficerNoFixedSchedule')
    : shift?.start_time && shift?.end_time
      ? `${formatTimePart(shift.start_time)} – ${formatTimePart(shift.end_time)}`
      : '07:00 – 16:00';
  const clockDisabled =
    summary == null ||
    !canClockIn ||
    clockPending ||
    (!isFieldOfficer && nextAction === 'done') ||
    (isFieldOfficer && nextAction === 'check_out' && !checkoutCode.trim());

  const primaryClockLabel =
    nextAction === 'check_out' ? t('checkOut') : nextAction === 'done' ? t('dayClockComplete') : t('checkIn');
  const scheduleHint = isFieldOfficer ? t('fieldOfficerAttendanceHint') : t('onceInOnceOut');
  const sessionsToday = today?.sessions_today ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-brand-600">
            {translateRole(localStorage.getItem('role'))}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {t('employeeDashboard')}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {summary?.employee?.full_name}
            {summary?.employee?.employee_id ? ` · ${summary.employee.employee_id}` : ''}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          {t('logout')}
        </Button>
      </div>

      {message && (
        <Alert tone={message.includes(t('checkedIn')) || message.includes(t('checkedOut')) ? 'success' : 'error'}>
          {message}
        </Alert>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t('todayStatus')}</h2>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {today?.status ? translateAttendanceStatus(today.status) : t('notCheckedIn')}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {isFieldOfficer ? shiftLabel : `${t('expectedShift')}: ${shiftLabel}`}
            {!isFieldOfficer && shift?.shift_name ? ` · ${shift.shift_name}` : ''}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-600">{scheduleHint}</p>
          {isFieldOfficer && summary?.has_checkout_code_today === false && sessionsToday.length > 0 && (
            <p className="mt-1 text-xs text-amber-700">{t('fieldOfficerCodeReminder')}</p>
          )}
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            {isFieldOfficer && sessionsToday.length > 0 ? (
              sessionsToday.map((seg, idx) => (
                <div key={seg.id || idx} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <div className="font-medium text-slate-800">{t('sessionN', { n: idx + 1 })}</div>
                  <div>
                    {t('checkIn')}: {seg.check_in ? new Date(seg.check_in).toLocaleString() : t('emDash')}
                  </div>
                  <div>
                    {t('checkOut')}: {seg.check_out ? new Date(seg.check_out).toLocaleString() : t('emDash')}
                  </div>
                  {seg.checkout_code ? (
                    <div>
                      {t('checkoutCode')}: {seg.checkout_code}
                    </div>
                  ) : null}
                  <div>
                    {t('workHours')}: {seg.work_hours != null ? seg.work_hours : t('emDash')}
                  </div>
                </div>
              ))
            ) : (
              <>
                <div>
                  {t('checkIn')}: {today?.check_in ? new Date(today.check_in).toLocaleString() : t('emDash')}
                </div>
                <div>
                  {t('checkOut')}: {today?.check_out ? new Date(today.check_out).toLocaleString() : t('emDash')}
                </div>
                <div>
                  {t('workHours')}: {today?.work_hours != null ? today.work_hours : t('emDash')}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t('weekHours')}</h2>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{summary?.weekWorkHours ?? 0}</div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('clockActions')}</h2>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('assignedOffice')}
            </label>
            {assignedOffice?.id ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {assignedOffice.name || t('officeIdFallback', { id: assignedOffice.id })}
              </div>
            ) : (
              <div className="text-sm text-amber-800">{t('noOfficeAssigned')}</div>
            )}
          </div>
          {nextAction === 'check_in' && canRemote ? (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={remoteWork} onChange={(e) => setRemoteWork(e.target.checked)} />
              {t('remoteWorkDay')}
            </label>
          ) : nextAction === 'check_in' ? (
            <p className="text-xs text-slate-500">{t('remoteWorkDisabledByAdmin')}</p>
          ) : null}
          {isFieldOfficer && nextAction === 'check_out' && (
            <Field label={t('checkoutCode')} hint={t('checkoutCodeHint')}>
              <input
                type="text"
                className={inputClass}
                value={checkoutCode}
                onChange={(e) => setCheckoutCode(e.target.value)}
                autoComplete="off"
                placeholder={t('checkoutCodePlaceholder')}
              />
            </Field>
          )}
          <Button
            variant="success"
            size="lg"
            className="w-full"
            disabled={clockDisabled}
            onClick={handleClock}
          >
            {clockPending ? t('locating') : primaryClockLabel}
          </Button>
        </div>
      </section>

      <Card title={t('loanTitle')} description={t('loanEmployeeHint')}>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleLoanSubmit}>
          <Field label={t('loanAmount')}>
            <input
              type="number"
              min="1"
              required
              className={inputClass}
              value={loanForm.loan_amount}
              onChange={(e) => setLoanForm((f) => ({ ...f, loan_amount: e.target.value }))}
              disabled={hasPendingLoan}
            />
          </Field>
          <Field label={t('loanMonthlyDeduction')} hint={t('loanPotongGajiHint')}>
            <input
              type="number"
              min="1"
              required
              className={inputClass}
              value={loanForm.monthly_deduction}
              onChange={(e) => setLoanForm((f) => ({ ...f, monthly_deduction: e.target.value }))}
              disabled={hasPendingLoan}
            />
          </Field>
          <Field label={t('loanNotes')} className="sm:col-span-2">
            <textarea
              className={`${inputClass} min-h-[72px]`}
              value={loanForm.notes}
              onChange={(e) => setLoanForm((f) => ({ ...f, notes: e.target.value }))}
              disabled={hasPendingLoan}
              maxLength={2000}
            />
          </Field>
          <div className="sm:col-span-2">
            {hasPendingLoan && (
              <p className="mb-3 text-sm text-amber-800">{t('loanPendingExists')}</p>
            )}
            <Button type="submit" variant="primary" disabled={loanSubmitting || hasPendingLoan}>
              {loanSubmitting ? t('loading') : t('loanSubmit')}
            </Button>
          </div>
        </form>
        {loans.length > 0 && (
          <ul className="mt-6 space-y-4 border-t border-slate-100 pt-6">
            {loans.map((loan) => (
              <li
                key={loan.id}
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-4 text-sm shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-slate-900">
                      Rp {Number(loan.loan_amount).toLocaleString('id-ID')}
                    </span>
                    <span className="ml-2 text-slate-500">
                      · Rp {Number(loan.monthly_deduction).toLocaleString('id-ID')}/{t('loanPerMonth')}
                    </span>
                  </div>
                  <Badge
                    variant={
                      loan.approval_status === 'approved'
                        ? loan.is_paid_off
                          ? 'success'
                          : 'success'
                        : loan.approval_status === 'rejected'
                          ? 'muted'
                          : 'neutral'
                    }
                  >
                    {loan.is_paid_off
                      ? t('loanProgressPaidOff')
                      : t(`loanStatus_${loan.approval_status}`)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {t('loanSubmittedAt')}: {new Date(loan.created_at).toLocaleString()}
                  {loan.decided_at && (
                    <>
                      {' '}
                      · {t('loanDecidedAt')}: {new Date(loan.decided_at).toLocaleString()}
                    </>
                  )}
                </p>
                <LoanProgress loan={loan} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('history')}</h2>
        {history.length ? (
          <ul className="mt-3 space-y-3 text-sm">
            {history.map((item) => (
              <li key={item.id} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                <div className="font-medium text-slate-900">{item.office_name}</div>
                <div className="text-slate-600">
                  {t('status')}: {translateAttendanceStatus(item.attendance_status)}
                </div>
                <div className="text-slate-600">
                  {t('checkIn')}: {item.check_in ? new Date(item.check_in).toLocaleString() : ''}
                </div>
                <div className="text-slate-600">
                  {t('checkOut')}: {item.check_out ? new Date(item.check_out).toLocaleString() : t('notCheckedOut')}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-600">{t('noHistory')}</p>
        )}
      </section>
    </div>
  );
}
