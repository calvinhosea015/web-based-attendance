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

  const handleCheckIn = async () => {
    if (!summary?.assigned_office?.id) {
      setMessage(t('noOfficeAssigned'));
      return;
    }
    setMessage('');
    setClockPending(true);
    try {
      await ensureCsrf();
      let pos;
      try {
        pos = await readPosition();
      } catch (geoErr) {
        setMessage(geoMessage(geoErr));
        return;
      }
      const { latitude, longitude, accuracy } = pos.coords;
      if (latitude == null || longitude == null || Number.isNaN(latitude) || Number.isNaN(longitude)) {
        setMessage(i18n.t('geoUnavailable'));
        return;
      }
      const client_ts_ms =
        typeof pos.timestamp === 'number' && pos.timestamp > 0 ? pos.timestamp : Date.now();
      await api.post(paths.checkIn, {
        lat: latitude,
        lng: longitude,
        accuracy_m: accuracy && accuracy > 0 ? accuracy : 25,
        client_ts_ms: client_ts_ms,
        remote_work: canRemote && remoteWork,
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
      await ensureCsrf();
      let pos;
      try {
        pos = await readPosition();
      } catch (geoErr) {
        setMessage(geoMessage(geoErr));
        return;
      }
      const { latitude, longitude, accuracy } = pos.coords;
      if (latitude == null || longitude == null || Number.isNaN(latitude) || Number.isNaN(longitude)) {
        setMessage(i18n.t('geoUnavailable'));
        return;
      }
      const client_ts_ms =
        typeof pos.timestamp === 'number' && pos.timestamp > 0 ? pos.timestamp : Date.now();
      await api.post(paths.checkOut, {
        lat: latitude,
        lng: longitude,
        accuracy_m: accuracy && accuracy > 0 ? accuracy : 25,
        client_ts_ms: client_ts_ms,
      });
      setMessage(t('checkedOut'));
      await refreshEmployee();
    } catch (err) {
      setMessage(formatApiError(err));
    } finally {
      setClockPending(false);
    }
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
          <div className="mt-2 space-y-1 text-sm text-slate-600">
            <div>
              {t('checkIn')}: {today?.check_in ? new Date(today.check_in).toLocaleString() : '—'}
            </div>
            <div>
              {t('checkOut')}: {today?.check_out ? new Date(today.check_out).toLocaleString() : '—'}
            </div>
            <div>
              {t('workHours')}: {today?.work_hours != null ? today.work_hours : '—'}
            </div>
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
          {canRemote ? (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={remoteWork} onChange={(e) => setRemoteWork(e.target.checked)} />
              {t('remoteWorkDay')}
            </label>
          ) : (
            <p className="text-xs text-slate-500">{t('remoteWorkDisabledByAdmin')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canClockIn || clockPending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleCheckIn}
            >
              {clockPending ? t('locating') : t('checkIn')}
            </button>
            <button
              type="button"
              disabled={clockPending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleCheckOut}
            >
              {t('checkOut')}
            </button>
          </div>
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
