import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, paths, ensureCsrf, rawApi } from '../api/client.js';

function readPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000 });
  });
}

export default function EmployeeDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [offices, setOffices] = useState([]);
  const [selectedOffice, setSelectedOffice] = useState('');
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [remoteWork, setRemoteWork] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) navigate('/login');
    const load = async () => {
      try {
        await ensureCsrf();
        const [o, s, h, l] = await Promise.all([
          api.get(paths.offices),
          api.get(paths.employeeSummary),
          api.get(paths.employeeAttendance),
          api.get(paths.employeeLeaves),
        ]);
        setOffices(o.data);
        if (o.data.length) setSelectedOffice(String(o.data[0].id));
        setSummary(s.data);
        setHistory(h.data);
        setLeaves(l.data);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [navigate]);

  const refreshEmployee = async () => {
    const [s, h, l] = await Promise.all([
      api.get(paths.employeeSummary),
      api.get(paths.employeeAttendance),
      api.get(paths.employeeLeaves),
    ]);
    setSummary(s.data);
    setHistory(h.data);
    setLeaves(l.data);
  };

  const handleCheckIn = async () => {
    if (!selectedOffice) {
      setMessage(t('selectOffice'));
      return;
    }
    setMessage('');
    try {
      await ensureCsrf();
      const pos = await readPosition();
      const { latitude, longitude, accuracy } = pos.coords;
      const client_ts_ms = pos.timestamp;
      await api.post(paths.checkIn, {
        lat: latitude,
        lng: longitude,
        office_id: Number(selectedOffice),
        accuracy_m: accuracy || 25,
        client_ts_ms: client_ts_ms,
        remote_work: remoteWork,
      });
      setMessage(t('checkedIn'));
      await refreshEmployee();
    } catch (err) {
      setMessage(err.response?.data?.message || err.message || String(err));
    }
  };

  const handleCheckOut = async () => {
    setMessage('');
    try {
      await ensureCsrf();
      const pos = await readPosition();
      const { latitude, longitude, accuracy } = pos.coords;
      const client_ts_ms = pos.timestamp;
      await api.post(paths.checkOut, {
        lat: latitude,
        lng: longitude,
        accuracy_m: accuracy || 25,
        client_ts_ms: client_ts_ms,
      });
      setMessage(t('checkedOut'));
      await refreshEmployee();
    } catch (err) {
      setMessage(err.response?.data?.message || err.message || String(err));
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
  const shift = summary?.shift;

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
        <h2 className="text-lg font-semibold text-slate-900">{t('shiftSchedule')}</h2>
        {shift ? (
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            <li>
              <span className="font-medium">{shift.shift_name}</span>
            </li>
            <li>
              {t('shiftHours')}: {shift.start_time} – {shift.end_time}
            </li>
            <li>
              {t('break')}: {shift.break_duration} {t('minutes')}
            </li>
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-600">{t('noShift')}</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('leaveBalance')}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {(summary?.leaveBalances || []).map((b) => (
            <li key={b.leave_type} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
              <div className="font-medium capitalize text-slate-900">{b.leave_type}</div>
              <div className="text-slate-600">
                {b.balance_days} {t('days')}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('leaveRequests')}</h2>
        {leaves.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {leaves.map((lv) => (
              <li key={lv.id} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                <span className="font-medium capitalize">{lv.leave_type}</span>
                <span className="text-slate-600">
                  {' '}
                  · {lv.start_date} → {lv.end_date} · {lv.approval_status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-600">{t('noLeaveRequests')}</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('clockActions')}</h2>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('office')}
            </label>
            {offices.length ? (
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={selectedOffice}
                onChange={(e) => setSelectedOffice(e.target.value)}
              >
                {offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-sm text-slate-600">{t('noOfficesAvailable')}</div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={remoteWork} onChange={(e) => setRemoteWork(e.target.checked)} />
            {t('remoteWorkDay')}
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!offices.length}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleCheckIn}
            >
              {t('checkIn')}
            </button>
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
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
