import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { api, paths, ensureCsrf, rawApi } from '../api/client.js';

export default function AdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [offices, setOffices] = useState([]);
  const [overview, setOverview] = useState(null);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'employee',
    office_id: '',
    employee_id: '',
    full_name: '',
  });
  const [newOffice, setNewOffice] = useState({ name: '', locationLink: '' });
  const [message, setMessage] = useState('');
  const [changingPasswordFor, setChangingPasswordFor] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('role') !== 'admin') navigate('/login');
    refresh();
  }, [navigate]);

  const refresh = async () => {
    try {
      await ensureCsrf();
      const [u, a, o, dash] = await Promise.all([
        api.get(paths.users),
        api.get(paths.attendanceAll),
        api.get(paths.offices),
        api.get(paths.adminDashboard),
      ]);
      setUsers(u.data);
      setAttendance(a.data);
      setOffices(o.data);
      setOverview(dash.data);
      if (!newUser.office_id && o.data.length) {
        setNewUser((prev) => ({ ...prev, office_id: String(o.data[0].id) }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddOffice = async (e) => {
    e.preventDefault();
    try {
      await api.post(paths.offices, newOffice);
      setMessage(t('officeAdded'));
      refresh();
      setNewOffice({ name: '', locationLink: '' });
    } catch (err) {
      setMessage(err.response?.data?.message || err.message);
    }
  };

  const handleDeleteOffice = async (id) => {
    try {
      await api.delete(`${paths.offices}/${id}`);
      setMessage(t('officeDeleted'));
      refresh();
    } catch (err) {
      setMessage(err.response?.data?.message || err.message);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        username: newUser.username,
        password: newUser.password,
        role: newUser.role,
        office_id: newUser.office_id ? Number(newUser.office_id) : undefined,
        employee_id: newUser.employee_id || undefined,
        full_name: newUser.full_name || undefined,
      };
      await api.post(paths.users, payload);
      setMessage(t('userAdded'));
      refresh();
      setNewUser({
        username: '',
        password: '',
        role: 'employee',
        office_id: offices.length ? String(offices[0].id) : '',
        employee_id: '',
        full_name: '',
      });
    } catch (err) {
      setMessage(err.response?.data?.message || err.message);
    }
  };

  const handleDeleteUser = async (id) => {
    try {
      await api.delete(`${paths.users}/${id}`);
      setMessage(t('userDeleted'));
      refresh();
    } catch (err) {
      setMessage(err.response?.data?.message || err.message);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    try {
      await api.put(`${paths.users}/${changingPasswordFor}/password`, { password: newPassword });
      setMessage(t('passwordChanged'));
      setChangingPasswordFor(null);
      setNewPassword('');
    } catch (err) {
      setMessage(err.response?.data?.message || err.message);
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.post(paths.attendanceExport, {}, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'attendance.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);
    }
  };

  const handleProfessionalExport = async () => {
    try {
      await ensureCsrf();
      const res = await api.post(paths.attendanceReportProfessional, {}, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'attendance_professional_report.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.message || err.message);
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

  const chartData =
    overview?.chart?.map((row) => ({
      date: String(row.d).slice(0, 10),
      present: row.present_like,
      late: row.late_cnt,
    })) || [];

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('adminDashboard')}</h1>
          <p className="text-sm text-slate-600">{t('adminSubtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={handleProfessionalExport}
          >
            {t('professionalReport')}
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={handleExport}
          >
            {t('exportExcel')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={handleLogout}
          >
            {t('logout')}
          </button>
        </div>
      </div>

      {overview && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('totalEmployees')} value={overview.totalEmployees} tone="blue" />
          <StatCard label={t('presentToday')} value={overview.presentToday} tone="emerald" />
          <StatCard label={t('lateToday')} value={overview.lateToday} tone="amber" />
          <StatCard label={t('absentToday')} value={overview.absentToday} tone="rose" />
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('attendanceCharts')}</h2>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="present" name={t('presentLike')} fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="late" name={t('late')} fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {overview?.payrollSummary?.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t('payrollSummary')}</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {overview.payrollSummary.map((p) => (
              <li key={p.payroll_period} className="flex justify-between py-2">
                <span className="font-medium text-slate-800">{p.payroll_period}</span>
                <span className="text-slate-600">
                  {t('rows')}: {p.rows} · {t('total')}: {Number(p.total_final).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t('manageUsers')}</h2>
          <form className="mt-4 space-y-3" onSubmit={handleAddUser}>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder={t('username')}
              value={newUser.username}
              onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              required
            />
            <input
              type="password"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder={t('password')}
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              required
            />
            <p className="text-xs text-slate-500">{t('passwordPolicyHint')}</p>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            >
              <option value="employee">{t('roleEmployee')}</option>
              <option value="admin">{t('roleAdmin')}</option>
            </select>
            {newUser.role === 'employee' && (
              <>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder={t('employeeCode')}
                  value={newUser.employee_id}
                  onChange={(e) => setNewUser({ ...newUser, employee_id: e.target.value })}
                  required
                />
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder={t('fullName')}
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  required
                />
              </>
            )}
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={newUser.office_id}
              onChange={(e) => setNewUser({ ...newUser, office_id: e.target.value })}
            >
              {offices.length ? (
                offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))
              ) : (
                <option value="">{t('noOfficesAvailable')}</option>
              )}
            </select>
            <button
              type="submit"
              className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-500"
            >
              {t('addUser')}
            </button>
          </form>
          <ul className="mt-4 space-y-2 text-sm">
            {users.map((user) => (
              <li
                key={user.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-medium text-slate-900">{user.username}</div>
                  <div className="text-xs text-slate-500">
                    {user.role}
                    {user.full_name ? ` · ${user.full_name}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium"
                    onClick={() => setChangingPasswordFor(user.id)}
                  >
                    {t('changePassword')}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700"
                    onClick={() => handleDeleteUser(user.id)}
                  >
                    {t('delete')}
                  </button>
                </div>
                {changingPasswordFor === user.id && (
                  <form className="mt-2 flex w-full flex-col gap-2 sm:flex-row" onSubmit={handleChangePassword}>
                    <input
                      type="password"
                      className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs"
                      placeholder={t('newPassword')}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                    <button type="submit" className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white">
                      {t('change')}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-3 py-1 text-xs"
                      onClick={() => {
                        setChangingPasswordFor(null);
                        setNewPassword('');
                      }}
                    >
                      {t('cancel')}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t('locationManagement')}</h2>
          <form className="mt-4 space-y-3" onSubmit={handleAddOffice}>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder={t('officeName')}
              value={newOffice.name}
              onChange={(e) => setNewOffice({ ...newOffice, name: e.target.value })}
              required
            />
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder={t('locationLink')}
              value={newOffice.locationLink}
              onChange={(e) => setNewOffice({ ...newOffice, locationLink: e.target.value })}
              required
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-500"
            >
              {t('addOffice')}
            </button>
          </form>
          <ul className="mt-4 space-y-2 text-sm">
            {offices.map((office) => (
              <li
                key={office.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2"
              >
                <div>
                  <div className="font-medium text-slate-900">{office.name}</div>
                  {office.link && (
                    <a className="text-xs text-brand-600 hover:underline" href={office.link} target="_blank" rel="noreferrer">
                      {t('mapLink')}
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700"
                  onClick={() => handleDeleteOffice(office.id)}
                >
                  {t('delete')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('attendance')}</h2>
        <div className="mt-3 max-h-96 overflow-auto text-sm">
          <table className="min-w-full border-collapse text-left">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-2 py-2">{t('employee')}</th>
                <th className="border-b border-slate-200 px-2 py-2">{t('office')}</th>
                <th className="border-b border-slate-200 px-2 py-2">{t('status')}</th>
                <th className="border-b border-slate-200 px-2 py-2">{t('checkIn')}</th>
                <th className="border-b border-slate-200 px-2 py-2">{t('checkOut')}</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-2 py-2">{row.full_name || row.employee_code}</td>
                  <td className="px-2 py-2">{row.office_name}</td>
                  <td className="px-2 py-2">{row.attendance_status}</td>
                  <td className="px-2 py-2">{row.check_in ? new Date(row.check_in).toLocaleString() : ''}</td>
                  <td className="px-2 py-2">
                    {row.check_out ? new Date(row.check_out).toLocaleString() : t('notCheckedOut')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {message && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }) {
  const tones = {
    blue: 'from-sky-500 to-indigo-600',
    emerald: 'from-emerald-500 to-teal-600',
    amber: 'from-amber-500 to-orange-600',
    rose: 'from-rose-500 to-red-600',
  };
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${tones[tone]} p-[1px] shadow-sm`}>
      <div className="rounded-2xl bg-white p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
      </div>
    </div>
  );
}
