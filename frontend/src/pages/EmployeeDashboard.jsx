import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  PageHero,
  panelClass,
} from '../components/ui.jsx';
import { api, paths, ensureCsrf, rawApi } from '../api/client.js';
import i18n from '../i18n.js';
import { translateAttendanceStatus, translateRole } from '../translateApi.js';
import {
  canAccessEmployeePayrollPortal,
  isPayrollOnlyRole,
  ROLE_EMPLOYEE,
  ROLE_FIELD_OFFICER,
  isAccountingRole,
  usesDailyWagePayrollRole,
} from '../roles.js';
import { fieldDeliveryDisplayFields } from '../utils/fieldCheckout.js';
import { readPosition, haversineMeters, geoMessage as geoMessageKey } from '../utils/geolocation.js';
import { payrollCycleLabel } from '../utils/payrollPeriod.js';
import { formatDisplayDate, formatDisplayDateTime } from '../utils/formatDate.js';
import EmployeeHistorySection from '../components/employee/EmployeeHistorySection.jsx';
import PayrollCard from '../components/employee/PayrollCard.jsx';
import LoanPanel from '../components/employee/LoanPanel.jsx';
import LeavePanel from '../components/employee/LeavePanel.jsx';
import FieldCodePanel from '../components/employee/FieldCodePanel.jsx';
import FieldOfficerRecap from '../components/employee/FieldOfficerRecap.jsx';
import { formatApiError } from '../utils/employeeFormat.js';
import { formatIdr } from '../utils/payrollDisplay.js';

function geoMessage(err) {
  const key = geoMessageKey(err);
  if (key) return i18n.t(key);
  return err?.message || i18n.t('geoUnavailable');
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
  const [messageTone, setMessageTone] = useState('error');
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [remoteWork, setRemoteWork] = useState(false);
  const [clockPending, setClockPending] = useState(false);
  const [checkoutCode, setCheckoutCode] = useState('');
  const [payroll, setPayroll] = useState([]);
  const [geoPreview, setGeoPreview] = useState(null);
  const [geoPreviewLoading, setGeoPreviewLoading] = useState(false);
  const [fieldDeliveries, setFieldDeliveries] = useState([]);

  const notify = (text, tone = 'error') => {
    setMessageTone(tone);
    setMessage(text);
  };

  const reloadHistory = async () => {
    try {
      const h = await api.get(paths.employeeAttendance);
      setHistory(h.data);
    } catch {
      /* ignore */
    }
  };

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
    if (!canAccessEmployeePayrollPortal(role)) {
      navigate('/login');
      return;
    }
    const load = async () => {
      try {
        await ensureCsrf();
      } catch (e) {
        notify(formatApiError(e));
        return;
      }
      try {
        if (isPayrollOnlyRole(role)) {
          const pr = await api.get(paths.employeePayroll);
          setPayroll(pr.data || []);
          return;
        }
        const isStaffKantor = role === ROLE_EMPLOYEE;
        const [s, h, pr, fd] = await Promise.all([
          api.get(paths.employeeSummary),
          api.get(paths.employeeAttendance),
          api.get(paths.employeePayroll).catch(() => ({ data: [] })),
          isStaffKantor
            ? api.get(paths.employeeFieldDeliveries).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        ]);
        setSummary(s.data);
        setHistory(h.data);
        setPayroll(pr.data || []);
        setFieldDeliveries(fd.data || []);
      } catch (e) {
        console.error(e);
        setMessageTone('error');
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

  const refreshGeoPreview = async () => {
    setGeoPreviewLoading(true);
    try {
      const pos = await readPosition();
      const { latitude, longitude, accuracy } = pos.coords;
      if (latitude == null || longitude == null || Number.isNaN(latitude) || Number.isNaN(longitude)) {
        setGeoPreview(null);
        return;
      }
      setGeoPreview({
        lat: latitude,
        lng: longitude,
        accuracy_m: accuracy && accuracy > 0 ? accuracy : null,
        at: Date.now(),
      });
    } catch {
      setGeoPreview(null);
    } finally {
      setGeoPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (!summary?.assigned_office?.id) return;
    refreshGeoPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when office assignment loads
  }, [summary?.assigned_office?.id]);

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
      notify(formatApiError(e));
    }
  };

  const captureLocation = async () => {
    await ensureCsrf();
    let pos;
    try {
      pos = await readPosition();
    } catch (geoErr) {
      notify(geoMessage(geoErr));
      return null;
    }
    const { latitude, longitude, accuracy } = pos.coords;
    if (latitude == null || longitude == null || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      notify(i18n.t('geoUnavailable'));
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
      notify(t('noOfficeAssigned'));
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
      notify(t('checkedIn'), 'success');
      setCheckoutCode('');
      await refreshEmployee();
    } catch (err) {
      notify(formatApiError(err));
    } finally {
      setClockPending(false);
    }
  };

  const handleCheckOut = async () => {
    setMessage('');
    setClockPending(true);
    try {
      const loc = await captureLocation();
      if (!loc) return;
      await api.post(paths.checkOut, loc);
      notify(t('checkedOut'), 'success');
      setCheckoutCode('');
      await refreshEmployee();
    } catch (err) {
      notify(formatApiError(err));
    } finally {
      setClockPending(false);
    }
  };

  const handleClock = async () => {
    const action = summary?.next_clock_action ?? 'check_in';
    if (action === 'check_out') await handleCheckOut();
    else if (action === 'check_in') await handleCheckIn();
  };

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
  const assignedOffices =
    summary?.assigned_offices?.length > 0
      ? summary.assigned_offices
      : assignedOffice?.id
        ? [assignedOffice]
        : [];
  const canRemote = summary?.remote_work_allowed !== false;
  const canClockIn = assignedOffices.some((o) => o?.id);
  const isFieldOfficer =
    summary?.field_officer_mode === true ||
    (!summary && localStorage.getItem('role') === ROLE_FIELD_OFFICER);
  const isDailyWageSchedule =
    summary?.daily_wage_mode === true ||
    usesDailyWagePayrollRole(summary?.role || localStorage.getItem('role'));
  const isUmum = summary?.umum_mode === true;
  const isOnceDailyInOut = summary?.once_daily_in_out_mode === true;
  const isAccounting =
    summary?.accounting_mode === true || isAccountingRole(summary?.role);
  const isStaffKantor = summary?.role === ROLE_EMPLOYEE;
  const nextAction = summary?.next_clock_action ?? 'check_in';
  const shift = summary?.shift;
  const shiftLabel = isDailyWageSchedule
    ? t('fieldFlexibleSchedule')
    : isUmum
      ? t('umumFlexibleSchedule')
      : isAccounting && shift?.start_time && shift?.end_time
        ? `${formatTimePart(shift.start_time)} – ${formatTimePart(shift.end_time)}`
        : shift?.start_time && shift?.end_time
          ? `${formatTimePart(shift.start_time)} – ${formatTimePart(shift.end_time)}`
          : '07:15 – 16:00';
  const clockDisabled =
    summary == null || !canClockIn || clockPending || nextAction === 'done';

  const primaryClockLabel =
    nextAction === 'check_out' ? t('checkOut') : nextAction === 'done' ? t('dayClockComplete') : t('checkIn');
  const scheduleHint = isDailyWageSchedule
    ? t('fieldOnceInOnceOut')
    : isUmum
      ? t('umumOncePerDay')
        : isAccounting
          ? t('accountingScheduleHint')
          : t('onceInOnceOut');
  const sessionsToday = today?.sessions_today ?? [];

  const baseRadius = summary?.check_in_radius_meters ?? 500;
  const gpsBufferCap = summary?.check_in_gps_buffer_cap_meters ?? 200;
  let nearestOfficePreview = null;
  if (geoPreview) {
    for (const o of assignedOffices) {
      if (o.lat == null || o.lng == null) continue;
      const d = Math.round(haversineMeters(geoPreview.lat, geoPreview.lng, o.lat, o.lng));
      if (!nearestOfficePreview || d < nearestOfficePreview.distance) {
        nearestOfficePreview = { office: o, distance: d };
      }
    }
  }
  const previewBaseRadius = nearestOfficePreview?.office?.radius_meters ?? baseRadius;
  const maxAllowedPreview =
    assignedOffices.some((o) => o?.lat != null && o?.lng != null)
      ? previewBaseRadius + Math.min(geoPreview?.accuracy_m ?? 0, gpsBufferCap)
      : null;
  const distancePreview = nearestOfficePreview?.distance ?? null;
  const withinAssignedRadius =
    distancePreview != null && maxAllowedPreview != null && distancePreview <= maxAllowedPreview;

  const payrollOnly = isPayrollOnlyRole(localStorage.getItem('role'));

  if (payrollOnly) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="apple-eyebrow">{t('headOfFinanceHubTitle')}</span>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-apple-text">
              {t('payrollEmployeeTitle')}
            </h1>
            <p className="mt-1 text-sm text-apple-label">{t('headOfFinanceNoAttendance')}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            {t('logout')}
          </Button>
        </div>
        {message && <Alert tone="error">{message}</Alert>}
        <Card
          title={t('headOfFinanceReviewOmset')}
          description={t('headOfFinanceReviewOmsetHint')}
          action={
            <Button variant="primary" onClick={() => navigate('/finance/field-omset')}>
              {t('headOfFinanceReviewOmset')}
            </Button>
          }
        >
          <p className="text-sm text-apple-label">{t('fieldOmsetReportSubtitle')}</p>
        </Card>
        <PayrollCard payroll={payroll} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6 sm:py-14">
      <PageHero
        eyebrow={translateRole(localStorage.getItem('role'))}
        title={t('employeeDashboard')}
        subtitle={
          summary?.employee?.full_name
            ? `${summary.employee.full_name}${summary?.employee?.employee_id ? ` · ${summary.employee.employee_id}` : ''}`
            : undefined
        }
        action={
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            {t('logout')}
          </Button>
        }
      />

      {message && <Alert tone={messageTone}>{message}</Alert>}

      {!isFieldOfficer && (
      <section className="grid gap-6 md:grid-cols-3">
        <div className={`${panelClass} p-6 md:col-span-2`}>
          <h2 className="text-[13px] font-medium text-apple-label">{t('todayStatus')}</h2>
          <div className="apple-metric mt-2">
            {today?.status ? translateAttendanceStatus(today.status) : t('notCheckedIn')}
          </div>
          <p className="mt-1 text-xs text-apple-label">
            {isOnceDailyInOut || isUmum || isAccounting
              ? shiftLabel
              : `${t('expectedShift')}: ${shiftLabel}`}
            {!isOnceDailyInOut && !isUmum && !isAccounting && shift?.shift_name
              ? ` · ${shift.shift_name}`
              : ''}
          </p>
          <p className="mt-1 text-xs font-medium text-apple-label">{scheduleHint}</p>
          {isFieldOfficer && summary?.has_checkout_code_today === false && (
            <p className="mt-1 text-xs text-amber-700">
              {t('fieldCodeRequiredToday')}
            </p>
          )}
          {isFieldOfficer && summary?.has_checkout_code_today === true && (
            <p className="mt-1 text-xs text-emerald-700">{t('fieldCodeSubmittedToday')}</p>
          )}
          <div className="mt-3 space-y-2 text-sm text-apple-label">
            {isOnceDailyInOut && sessionsToday.length > 0 ? (
              sessionsToday.map((seg, idx) => (
                <div key={seg.id || idx} className="apple-inset-panel">
                  <div className="font-medium text-apple-text">{t('sessionN', { n: idx + 1 })}</div>
                  <div>
                    {t('checkIn')}: {seg.check_in ? formatDisplayDateTime(seg.check_in) : t('emDash')}
                  </div>
                  <div>
                    {t('checkOut')}: {seg.check_out ? formatDisplayDateTime(seg.check_out) : t('emDash')}
                  </div>
                  {isFieldOfficer && seg.checkout_code ? (
                    <p>
                      {t('fieldCheckoutCode')}: {seg.checkout_code}
                    </p>
                  ) : null}
                  <div>
                    {t('workHours')}: {seg.work_hours != null ? seg.work_hours : t('emDash')}
                  </div>
                </div>
              ))
            ) : (
              <>
                <div>
                  {t('checkIn')}: {today?.check_in ? formatDisplayDateTime(today.check_in) : t('emDash')}
                </div>
                {!isUmum && (
                  <>
                    <div>
                      {t('checkOut')}: {today?.check_out ? formatDisplayDateTime(today.check_out) : t('emDash')}
                    </div>
                    <div>
                      {t('workHours')}: {today?.work_hours != null ? today.work_hours : t('emDash')}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div className={`${panelClass} p-6`}>
          <h2 className="text-[13px] font-medium text-apple-label">{t('weekHours')}</h2>
          <div className="apple-metric mt-2">{summary?.weekWorkHours ?? 0}</div>
        </div>
      </section>
      )}

      {isFieldOfficer ? (
        <>
          <Card title={t('clockActions')}>
            <div className="space-y-6">
              <div>
                <p className="text-[13px] font-medium text-apple-label">
                  {t('fieldOfficerAssignedLocations')}
                </p>
                {assignedOffices.length ? (
                  <ul className="mt-2 space-y-2 text-sm text-apple-text">
                    {assignedOffices.map((o) => (
                      <li
                        key={o.id}
                        className="rounded-apple-lg border border-black/[0.06] bg-apple-fill/80 px-3 py-2.5"
                      >
                        <div className="font-medium">
                          {o.name || t('officeIdFallback', { id: o.id })}
                          {nearestOfficePreview?.office?.id === o.id && distancePreview != null ? (
                            <span className="ml-1 text-xs font-normal text-apple-label">
                              ({t('locationNearest')})
                            </span>
                          ) : null}
                        </div>
                        {o.link ? (
                          <a
                            className="mt-1 inline-block text-xs text-brand-600 hover:underline"
                            href={o.link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t('mapLink')}
                          </a>
                        ) : (
                          <p className="mt-1 text-xs text-amber-700">{t('fieldOfficerPabrikNoLocation')}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-amber-800">{t('noOfficeAssigned')}</p>
                )}
                {assignedOffices.length > 1 ? (
                  <p className="mt-3 text-xs text-apple-label">{t('fieldOfficerMultiLocationHint')}</p>
                ) : null}
              </div>

              <div className="border-t border-black/[0.06] pt-6">
                <p className="text-[13px] font-medium text-apple-label">{t('currentLocation')}</p>
                {assignedOffices.length > 0 ? (
                  <div className="mt-2 text-sm text-apple-text">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-apple-label">{scheduleHint}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={geoPreviewLoading || clockPending}
                        onClick={refreshGeoPreview}
                      >
                        {geoPreviewLoading ? t('locating') : t('locationRefresh')}
                      </Button>
                    </div>
                    {geoPreview ? (
                      <div className="mt-3 space-y-1">
                        <p>
                          {t('latitude')}: {geoPreview.lat.toFixed(5)} · {t('longitude')}:{' '}
                          {geoPreview.lng.toFixed(5)}
                        </p>
                        {geoPreview.accuracy_m != null && (
                          <p>{t('locationReady', { accuracy: Math.round(geoPreview.accuracy_m) })}</p>
                        )}
                        {distancePreview != null && maxAllowedPreview != null ? (
                          <p className={!withinAssignedRadius ? 'text-amber-800' : 'text-emerald-800'}>
                            {assignedOffices.length > 1
                              ? t('locationDistanceMulti', {
                                  distance: distancePreview,
                                  office:
                                    nearestOfficePreview?.office?.name ||
                                    t('officeIdFallback', { id: nearestOfficePreview?.office?.id }),
                                })
                              : t('locationDistance', { distance: distancePreview })}
                          </p>
                        ) : (
                          <p className="text-amber-800">{t('locationDistanceUnknown')}</p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-3 text-amber-800">
                        {geoPreviewLoading ? t('locating') : t('geoUnavailable')}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-apple-label">{t('locationHint')}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-amber-800">{t('noOfficeAssigned')}</p>
                )}
              </div>

              <div className="border-t border-black/[0.06] pt-6">
                <p className="text-[13px] font-medium text-apple-label">{t('todayStatus')}</p>
                <p className="apple-metric mt-1">
                  {today?.status ? translateAttendanceStatus(today.status) : t('notCheckedIn')}
                </p>
                {summary?.has_checkout_code_today === false && (
                  <p className="mt-1 text-xs text-amber-700">{t('fieldCodeRequiredToday')}</p>
                )}
                {summary?.has_checkout_code_today === true && (
                  <p className="mt-1 text-xs text-emerald-700">{t('fieldCodeSubmittedToday')}</p>
                )}
                <div className="mt-2 space-y-1 text-sm text-apple-label">
                  <div>
                    {t('checkIn')}: {today?.check_in ? formatDisplayDateTime(today.check_in) : t('emDash')}
                  </div>
                  <div>
                    {t('checkOut')}: {today?.check_out ? formatDisplayDateTime(today.check_out) : t('emDash')}
                  </div>
                </div>
                <Button
                  variant="success"
                  size="lg"
                  className="mt-4 w-full"
                  disabled={clockDisabled}
                  onClick={handleClock}
                >
                  {clockPending ? t('locating') : primaryClockLabel}
                </Button>
              </div>

              <FieldCodePanel summary={summary} notify={notify} onRefresh={refreshEmployee} />
            </div>
          </Card>

          <EmployeeHistorySection
            history={history}
            isUmum={isUmum}
            onCorrectionSubmitted={reloadHistory}
          />

          <FieldOfficerRecap notify={notify} />
        </>
      ) : (
      <Card title={t('clockActions')}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-apple-label">
              {assignedOffices.length > 1 ? t('assignedOffices') : t('assignedOffice')}
            </label>
            {assignedOffices.length ? (
              <ul className="space-y-1.5 rounded-apple-lg border border-black/[0.06] bg-apple-fill px-3 py-2 text-sm text-apple-text">
                {assignedOffices.map((o) => (
                  <li key={o.id}>
                    {o.name || t('officeIdFallback', { id: o.id })}
                    {nearestOfficePreview?.office?.id === o.id && distancePreview != null ? (
                      <span className="ml-1 text-xs text-apple-label">
                        ({t('locationNearest')})
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-amber-800">{t('noOfficeAssigned')}</div>
            )}
          </div>
          {assignedOffices.length > 0 && (
            <div className="rounded-apple-lg border border-black/[0.06] bg-apple-fill/80 px-3 py-3 text-sm text-apple-text">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-apple-label">
                  {t('currentLocation')}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={geoPreviewLoading || clockPending}
                  onClick={refreshGeoPreview}
                >
                  {geoPreviewLoading ? t('locating') : t('locationRefresh')}
                </Button>
              </div>
              {geoPreview ? (
                <div className="mt-2 space-y-1">
                  <p>
                    {t('latitude')}: {geoPreview.lat.toFixed(5)} · {t('longitude')}:{' '}
                    {geoPreview.lng.toFixed(5)}
                  </p>
                  {geoPreview.accuracy_m != null && (
                    <p>{t('locationReady', { accuracy: Math.round(geoPreview.accuracy_m) })}</p>
                  )}
                  {distancePreview != null && maxAllowedPreview != null ? (
                    <p
                      className={
                        !withinAssignedRadius ? 'text-amber-800' : 'text-emerald-800'
                      }
                    >
                      {t('locationDistance', { distance: distancePreview })}
                    </p>
                  ) : (
                    <p className="text-amber-800">{t('locationDistanceUnknown')}</p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-amber-800">
                  {geoPreviewLoading ? t('locating') : t('geoUnavailable')}
                </p>
              )}
              <p className="mt-2 text-xs text-apple-label">{t('locationHint')}</p>
            </div>
          )}
          {nextAction === 'check_in' && canRemote ? (
            <label className="flex items-center gap-2 text-sm text-apple-text">
              <input type="checkbox" checked={remoteWork} onChange={(e) => setRemoteWork(e.target.checked)} />
              {t('remoteWorkDay')}
            </label>
          ) : nextAction === 'check_in' ? (
            <p className="text-xs text-apple-label">{t('remoteWorkDisabledByAdmin')}</p>
          ) : null}
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
      </Card>
      )}

      {!isDailyWageSchedule && <PayrollCard payroll={payroll} />}

      {isStaffKantor && <LeavePanel notify={notify} />}

      <LoanPanel notify={notify} />

      {isStaffKantor && (
        <Card title={t('fieldDeliveryTitle')} description={t('fieldDeliveryHint')}>
          {fieldDeliveries.length ? (
            <ul className="space-y-4 text-sm">
              {fieldDeliveries.map((row) => {
                const parsed = fieldDeliveryDisplayFields(row);
                const dateLabel = row.valid_on
                  ? formatDisplayDate(row.valid_on)
                  : row.check_out
                    ? formatDisplayDateTime(row.check_out)
                    : t('emDash');
                return (
                  <li
                    key={row.id}
                    className="rounded-apple-lg border border-black/[0.04] bg-apple-fill/80 px-3 py-3"
                  >
                    <div className="font-medium text-apple-text">
                      {row.full_name}
                      {row.employee_code ? ` · ${row.employee_code}` : ''}
                    </div>
                    <div className="mt-1 text-apple-label">
                      {t('fieldDeliveryDate')}: {dateLabel}
                      {row.check_out ? (
                        <>
                          {' '}
                          · {t('checkOut')}: {formatDisplayDateTime(row.check_out)}
                        </>
                      ) : null}
                    </div>
                    {row.checkout_code ? (
                      <p className="mt-2 font-mono text-xs text-apple-text break-all">
                        {row.checkout_code}
                      </p>
                    ) : null}
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
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title={t('fieldDeliveryEmpty')} />
          )}
        </Card>
      )}

      {!isFieldOfficer && (
      <EmployeeHistorySection
        history={history}
        isUmum={isUmum}
        onCorrectionSubmitted={reloadHistory}
      />
      )}

      {isDailyWageSchedule && <PayrollCard payroll={payroll} />}
    </div>
  );
}
