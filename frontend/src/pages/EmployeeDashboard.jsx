import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, paths, ensureCsrf, rawApi } from '../api/client.js';
import i18n from '../i18n.js';

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
  const data = err.response?.data;
  let msg = data?.message || err.message || String(err);
  if (Array.isArray(data?.errors) && data.errors.length) {
    const details = data.errors.map((e) => e.msg || `${e.path || ''} ${e.msg || ''}`.trim()).join(' · ');
    if (details) msg = `${msg} (${details})`;
  }
  return msg;
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

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) navigate('/login');
    const load = async () => {
      try {
        await ensureCsrf();
      } catch (e) {
        setMessage(formatApiError(e));
        return;
      }
      try {
        const [s, h] = await Promise.all([
          api.get(paths.employeeSummary),
          api.get(paths.employeeAttendance),
        ]);
        setSummary(s.data);
        setHistory(h.data);
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
      await refreshEmployee();
    } catch (err) {
      setMessage(formatApiError(err));
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
      setMessage(t('checkedOut'));
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
  const nextAction = summary?.next_clock_action ?? 'check_in';
  const eventsDone = summary?.clock_events_done ?? 0;
  const eventsTarget = summary?.clock_events_target ?? 2;
  const split = summary?.split_shift;
  const shiftLabel = (() => {
    if (
      split &&
      split.segment1_start &&
      split.segment1_end &&
      split.segment2_start &&
      split.segment2_end
    ) {
      return `${formatTimePart(split.segment1_start)}–${formatTimePart(split.segment1_end)} · ${formatTimePart(split.segment2_start)}–${formatTimePart(split.segment2_end)}`;
    }
    const shift = summary?.shift;
    if (shift && shift.start_time && shift.end_time) {
      return `${formatTimePart(shift.start_time)} – ${formatTimePart(shift.end_time)}`;
    }
    return '07:00 – 16:00';
  })();
  const clockDisabled =
    summary == null || !canClockIn || clockPending || nextAction === 'done';

  const primaryClockLabel =
    nextAction === 'check_out' ? t('checkOut') : nextAction === 'done' ? t('dayClockComplete') : t('checkIn');

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('employeeDashboard')}</h1>
          <p className="text-sm text-slate-600">
            {summary?.employee?.full_name}
            {summary?.employee?.employee_id ? ` · ${summary.employee.employee_id}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          onClick={handleLogout}
        >
          {t('logout')}
        </button>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t('todayStatus')}</h2>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{today?.status || t('notCheckedIn')}</div>
          <p className="mt-1 text-xs text-slate-500">
            {t('expectedShift')}: {shiftLabel}
            {summary?.shift?.shift_name && !summary?.split_shift ? ` · ${summary.shift.shift_name}` : ''}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-600">
            {t('clockProgress', { done: eventsDone, target: eventsTarget })}
          </p>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            {today?.sessions_today?.length ? (
              today.sessions_today.map((seg, idx) => (
                <div key={seg.id || idx} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <div className="font-medium text-slate-800">{t('sessionN', { n: idx + 1 })}</div>
                  <div>
                    {t('checkIn')}: {seg.check_in ? new Date(seg.check_in).toLocaleString() : '—'}
                  </div>
                  <div>
                    {t('checkOut')}: {seg.check_out ? new Date(seg.check_out).toLocaleString() : '—'}
                  </div>
                  <div>
                    {t('workHours')}: {seg.work_hours != null ? seg.work_hours : '—'}
                  </div>
                </div>
              ))
            ) : (
              <>
                <div>
                  {t('checkIn')}: {today?.check_in ? new Date(today.check_in).toLocaleString() : '—'}
                </div>
                <div>
                  {t('checkOut')}: {today?.check_out ? new Date(today.check_out).toLocaleString() : '—'}
                </div>
                <div>
                  {t('workHours')}: {today?.work_hours != null ? today.work_hours : '—'}
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
                {assignedOffice.name || `ID ${assignedOffice.id}`}
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
          <button
            type="button"
            disabled={clockDisabled}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleClock}
          >
            {clockPending ? t('locating') : primaryClockLabel}
          </button>
          {message && <p className="text-sm text-slate-800">{message}</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('history')}</h2>
        {history.length ? (
          <ul className="mt-3 space-y-3 text-sm">
            {history.map((item) => (
              <li key={item.id} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                <div className="font-medium text-slate-900">{item.office_name}</div>
                <div className="text-slate-600">
                  {t('status')}: {item.attendance_status}
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
