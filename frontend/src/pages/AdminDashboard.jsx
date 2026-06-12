import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AdminLayout from '../components/AdminLayout.jsx';
import { Alert, Button, PasswordInput } from '../components/ui.jsx';
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
import { translateApiMessage, translateAttendanceStatus, translateRole } from '../translateApi.js';
import {
  isAttendanceRole,
  isAccountingRole,
  isGeneralAffairsRole,
  isHeadOfFinanceRole,
  usesMultipleOfficesRole,
  requiresFullName,
} from '../roles.js';
import { formatDisplayDateTime } from '../utils/formatDate.js';

function toTimeInputValue(v) {
  if (v == null || v === '') return '';
  const s = String(v);
  const iso = s.match(/T(\d{1,2}):(\d{2})(?::(\d{2}))?/i);
  if (iso) {
    const h = String(parseInt(iso[1], 10)).padStart(2, '0');
    const mm = String(parseInt(iso[2], 10)).padStart(2, '0');
    return `${h}:${mm}`;
  }
  return /^\d{1,2}:\d{2}/.test(s) ? s.slice(0, 5) : '';
}

function toDateInputValue(v) {
  if (v == null || v === '') return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return '';
}

function formatUserApiError(err) {
  return translateApiMessage(err) || String(err);
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [perUserSelectedId, setPerUserSelectedId] = useState('');
  const [perUserAttendance, setPerUserAttendance] = useState(null);
  const [perUserLoading, setPerUserLoading] = useState(false);
  const [offices, setOffices] = useState([]);
  const [pabriks, setPabriks] = useState([]);
  const [overview, setOverview] = useState(null);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'employee',
    office_id: '',
    office_ids: [],
    pabrik_ids: [],
    full_name: '',
    remote_work_allowed: true,
    join_date: '',
    birthday: '',
    custom_work_start: '09:00',
    custom_work_end: '17:00',
    basic_salary: '',
  });
  const [newOffice, setNewOffice] = useState({ name: '', locationLink: '' });
  const [editingOffice, setEditingOffice] = useState(null);
  const [message, setMessage] = useState('');
  const [changingPasswordFor, setChangingPasswordFor] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [editingUser, setEditingUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('role') !== 'admin') navigate('/login');
    refresh();
  }, [navigate]);

  const refresh = async () => {
    try {
      await ensureCsrf();
      const [u, a, o, dash, pabrikRes] = await Promise.all([
        api.get(paths.users),
        api.get(paths.attendanceAll),
        api.get(paths.offices),
        api.get(paths.adminDashboard),
        api.get(paths.adminPabriks).catch(() => ({ data: { pabriks: [] } })),
      ]);
      setUsers(u.data);
      setAttendance(a.data);
      setOffices(o.data);
      setOverview(dash.data);
      setPabriks(
        Array.isArray(pabrikRes.data?.pabriks) ? pabrikRes.data.pabriks : []
      );
      if (perUserSelectedId) {
        try {
          const ur = await api.get(paths.userAttendance(perUserSelectedId), { params: { limit: 200 } });
          setPerUserAttendance(ur.data);
        } catch (err) {
          console.error(err);
          setPerUserAttendance(null);
        }
      }
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
      setMessage(translateApiMessage(err));
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
    ) {
      return;
    }
    try {
      await api.delete(paths.office(id));
      if (editingOffice != null && Number(editingOffice.id) === Number(id)) {
        setEditingOffice(null);
      }
      setMessage(t('officeDeleted'));
      refresh();
    } catch (err) {
      setMessage(translateApiMessage(err));
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
    try {
      await api.patch(paths.office(editingOffice.id), {
        name: editingOffice.name,
        locationLink: editingOffice.locationLink,
      });
      setMessage(t('officeUpdated'));
      setEditingOffice(null);
      refresh();
    } catch (err) {
      setMessage(translateApiMessage(err));
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    const parsedOffice =
      newUser.office_id !== '' && newUser.office_id != null
        ? Number(newUser.office_id)
        : NaN;
    const officeOk = Number.isFinite(parsedOffice) && parsedOffice >= 1;
    const fieldPabrikIds = (newUser.pabrik_ids || [])
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n) && n >= 1);
    if (usesMultipleOfficesRole(newUser.role) && fieldPabrikIds.length < 1) {
      setMessage(t('fieldOfficerPabriksRequired'));
      return;
    }
    if (isAttendanceRole(newUser.role) && !usesMultipleOfficesRole(newUser.role) && !officeOk) {
      setMessage(t('officeRequiredEmployee'));
      return;
    }
    if (isHeadOfFinanceRole(newUser.role) && !newUser.full_name?.trim()) {
      setMessage(t('fullNameRequired'));
      return;
    }
    if (requiresFullName(newUser.role) && !newUser.full_name?.trim()) {
      setMessage(t('fullNameRequired'));
      return;
    }
    if (isAccountingRole(newUser.role)) {
      if (!newUser.custom_work_start || !newUser.custom_work_end) {
        setMessage(t('accountingWorkStart') + ' / ' + t('accountingWorkEnd'));
        return;
      }
    }
    try {
      const payload = {
        username: newUser.username.trim(),
        password: newUser.password,
        role: newUser.role,
        full_name: newUser.full_name?.trim() || undefined,
      };
      if (usesMultipleOfficesRole(newUser.role)) {
        payload.pabrik_ids = fieldPabrikIds;
      } else if (officeOk) {
        payload.office_id = parsedOffice;
      }
      if (isAttendanceRole(newUser.role) && !usesMultipleOfficesRole(newUser.role)) {
        payload.office_id = parsedOffice;
        payload.remote_work_allowed = Boolean(newUser.remote_work_allowed);
        if (newUser.join_date) payload.join_date = newUser.join_date;
        if (newUser.birthday) payload.birthday = newUser.birthday;
      }
      if (isAccountingRole(newUser.role)) {
        payload.custom_work_start = newUser.custom_work_start;
        payload.custom_work_end = newUser.custom_work_end;
        payload.basic_salary = Number(newUser.basic_salary) || 0;
      }
      if (isGeneralAffairsRole(newUser.role) || isHeadOfFinanceRole(newUser.role)) {
        payload.basic_salary = Number(newUser.basic_salary) || 0;
      }
      const res = await api.post(paths.users, payload);
      const ec = res.data?.employee_code;
      setMessage(ec ? `${t('userAdded')} — ${t('employeeCode')}: ${ec}` : t('userAdded'));
      refresh();
      setNewUser({
        username: '',
        password: '',
        role: 'employee',
        office_id: offices.length ? String(offices[0].id) : '',
        office_ids: [],
        pabrik_ids: [],
        full_name: '',
        remote_work_allowed: true,
        join_date: '',
        birthday: '',
        custom_work_start: '09:00',
        custom_work_end: '17:00',
        basic_salary: '',
      });
    } catch (err) {
      setMessage(formatUserApiError(err));
    }
  };

  const handleDeleteUser = async (id) => {
    try {
      await api.delete(`${paths.users}/${id}`);
      setMessage(t('userDeleted'));
      setEditingUser((cur) => (cur && Number(cur.id) === Number(id) ? null : cur));
      refresh();
    } catch (err) {
      setMessage(formatUserApiError(err));
    }
  };

  const openEditUser = (user) => {
    setChangingPasswordFor(null);
    setEditingUser({
      id: user.id,
      username: user.username,
      role: user.role,
      office_id: user.office_id != null ? String(user.office_id) : '',
      office_ids: Array.isArray(user.office_ids)
        ? user.office_ids.map(String)
        : user.office_id != null
          ? [String(user.office_id)]
          : [],
      pabrik_ids: Array.isArray(user.pabrik_ids) ? user.pabrik_ids.map(String) : [],
      full_name: user.full_name || '',
      remote_work_allowed: user.remote_work_allowed !== false,
      join_date: toDateInputValue(user.join_date),
      birthday: toDateInputValue(user.birthday),
      custom_work_start: toTimeInputValue(user.custom_work_start) || '09:00',
      custom_work_end: toTimeInputValue(user.custom_work_end) || '17:00',
      basic_salary: user.basic_salary != null ? String(user.basic_salary) : '',
    });
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const body = {
        username: editingUser.username.trim(),
        role: editingUser.role,
      };
      if (isHeadOfFinanceRole(editingUser.role)) {
        const fn = editingUser.full_name.trim();
        if (!fn) {
          setMessage(t('fullNameRequired'));
          return;
        }
        body.full_name = fn;
        body.basic_salary = Number(editingUser.basic_salary) || 0;
        body.join_date = editingUser.join_date || null;
        body.birthday = editingUser.birthday || null;
      } else if (isAttendanceRole(editingUser.role)) {
        const fn = editingUser.full_name.trim();
        if (requiresFullName(editingUser.role) && !fn) {
          setMessage(t('fullNameRequired'));
          return;
        }
        if (usesMultipleOfficesRole(editingUser.role)) {
          const pabrikIds = (editingUser.pabrik_ids || [])
            .map((id) => Number(id))
            .filter((n) => Number.isFinite(n) && n >= 1);
          if (pabrikIds.length < 1) {
            setMessage(t('fieldOfficerPabriksRequired'));
            return;
          }
          body.pabrik_ids = pabrikIds;
        } else if (!editingUser.office_id) {
          setMessage(t('officeRequiredEmployee'));
          return;
        } else {
          body.office_id = Number(editingUser.office_id);
        }
        body.full_name = fn;
        body.remote_work_allowed = Boolean(editingUser.remote_work_allowed);
        body.join_date = editingUser.join_date || null;
        body.birthday = editingUser.birthday || null;
        if (isAccountingRole(editingUser.role)) {
          body.custom_work_start = editingUser.custom_work_start;
          body.custom_work_end = editingUser.custom_work_end;
          body.basic_salary = Number(editingUser.basic_salary) || 0;
        }
        if (isGeneralAffairsRole(editingUser.role)) {
          body.basic_salary = Number(editingUser.basic_salary) || 0;
        }
      } else if (editingUser.office_id) {
        body.office_id = Number(editingUser.office_id);
      }
      await api.put(`${paths.users}/${editingUser.id}`, body);
      setMessage(t('userUpdated'));
      setEditingUser(null);
      refresh();
    } catch (err) {
      setMessage(formatUserApiError(err));
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
      setMessage(translateApiMessage(err));
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
      link.setAttribute('download', 'absen_hjs.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);
      setMessage(translateApiMessage(err));
    }
  };

  const chartData =
    overview?.chart?.map((row) => ({
      date: String(row.d).slice(0, 10),
      present: row.present_like,
      late: row.late_cnt,
    })) || [];

  return (
    <AdminLayout
      title={t('adminDashboard')}
      subtitle={t('adminSubtitle')}
      actions={
        <>
          <Button variant="secondary" onClick={handleProfessionalExport}>
            {t('professionalReport')}
          </Button>
          <Button variant="secondary" onClick={handleExport}>
            {t('exportExcel')}
          </Button>
        </>
      }
    >
      <div className="space-y-8">
      {message && <Alert tone="info">{message}</Alert>}

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

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{t('payrollSummary')}</h2>
          <Link to="/admin/payroll">
            <Button variant="secondary" size="sm">
              {t('payrollOpenAdmin')}
            </Button>
          </Link>
        </div>
        {overview?.payrollSummary?.length > 0 ? (
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
        ) : (
          <p className="mt-2 text-sm text-slate-600">{t('payrollSummaryEmpty')}</p>
        )}
      </section>

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
            <PasswordInput
              inputClassName="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder={t('password')}
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              required
            />
            <p className="text-xs text-slate-500">{t('passwordPolicyHint')}</p>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={newUser.role}
              onChange={(e) => {
                const role = e.target.value;
                setNewUser((prev) => {
                  const next = { ...prev, role };
                  if (usesMultipleOfficesRole(role) && !(prev.office_ids?.length) && prev.office_id) {
                    next.office_ids = [String(prev.office_id)];
                  }
                  return next;
                });
              }}
            >
              <option value="employee">{t('roleEmployee')}</option>
              <option value="field_officer">{t('roleFieldOfficer')}</option>
              <option value="umum">{t('roleUmum')}</option>
              <option value="accounting">{t('roleAccounting')}</option>
              <option value="general_affairs">{t('roleGeneralAffairs')}</option>
              <option value="head_of_finance">{t('roleHeadOfFinance')}</option>
              <option value="admin">{t('roleAdmin')}</option>
            </select>
            {requiresFullName(newUser.role) && (
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder={t('fullName')}
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                required
              />
            )}
            {isAttendanceRole(newUser.role) && !isHeadOfFinanceRole(newUser.role) && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={newUser.remote_work_allowed}
                  onChange={(e) => setNewUser({ ...newUser, remote_work_allowed: e.target.checked })}
                />
                {t('allowRemoteWork')}
              </label>
            )}
            {newUser.role === 'employee' && (
              <p className="text-xs text-slate-500">{t('twoClockScheduleFixed')}</p>
            )}
            {isGeneralAffairsRole(newUser.role) && (
              <>
                <p className="text-xs text-slate-500">{t('generalAffairsOnceInOut')}</p>
                <p className="text-xs text-slate-500">{t('generalAffairsAbsenceHint')}</p>
                <input
                  type="number"
                  min="0"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder={t('generalAffairsBasicSalary')}
                  value={newUser.basic_salary}
                  onChange={(e) => setNewUser({ ...newUser, basic_salary: e.target.value })}
                />
              </>
            )}
            {isHeadOfFinanceRole(newUser.role) && (
              <>
                <p className="text-xs text-slate-500">{t('headOfFinanceNoAttendance')}</p>
                <input
                  type="number"
                  min="0"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder={t('headOfFinanceBasicSalary')}
                  value={newUser.basic_salary}
                  onChange={(e) => setNewUser({ ...newUser, basic_salary: e.target.value })}
                />
              </>
            )}
            {isAccountingRole(newUser.role) && (
              <>
                <p className="text-xs text-slate-500">{t('accountingScheduleHint')}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      {t('accountingWorkStart')}
                    </span>
                    <input
                      type="time"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={newUser.custom_work_start}
                      onChange={(e) =>
                        setNewUser({ ...newUser, custom_work_start: e.target.value })
                      }
                      required
                    />
                  </label>
                  <label className="block text-sm text-slate-700">
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      {t('accountingWorkEnd')}
                    </span>
                    <input
                      type="time"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={newUser.custom_work_end}
                      onChange={(e) => setNewUser({ ...newUser, custom_work_end: e.target.value })}
                      required
                    />
                  </label>
                </div>
                <input
                  type="number"
                  min="0"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder={t('accountingBasicSalary')}
                  value={newUser.basic_salary}
                  onChange={(e) => setNewUser({ ...newUser, basic_salary: e.target.value })}
                />
              </>
            )}
            {isAttendanceRole(newUser.role) && !isHeadOfFinanceRole(newUser.role) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-slate-700">
                  <span className="mb-1 block text-xs font-medium text-slate-600">{t('startDate')}</span>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={newUser.join_date}
                    onChange={(e) => setNewUser({ ...newUser, join_date: e.target.value })}
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  <span className="mb-1 block text-xs font-medium text-slate-600">{t('birthday')}</span>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={newUser.birthday}
                    onChange={(e) => setNewUser({ ...newUser, birthday: e.target.value })}
                  />
                </label>
              </div>
            )}
            {usesMultipleOfficesRole(newUser.role) && (
              <div className="rounded-lg border border-slate-200 bg-apple-fill p-3">
                <p className="mb-2 text-xs font-medium text-slate-600">{t('fieldOfficerPabriksLabel')}</p>
                <p className="mb-2 text-xs text-slate-500">{t('fieldOfficerPabriksHint')}</p>
                {pabriks.length ? (
                  <div className="max-h-40 space-y-1.5 overflow-y-auto">
                    {pabriks.map((pabrik) => {
                      const idStr = String(pabrik.id);
                      const checked = (newUser.pabrik_ids || []).includes(idStr);
                      return (
                        <label
                          key={pabrik.id}
                          className="flex cursor-pointer items-start gap-2 text-sm text-slate-800"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={checked}
                            onChange={() => {
                              setNewUser((prev) => {
                                const set = new Set(prev.pabrik_ids || []);
                                if (set.has(idStr)) set.delete(idStr);
                                else set.add(idStr);
                                return { ...prev, pabrik_ids: [...set] };
                              });
                            }}
                          />
                          <span>
                            {pabrik.pabrik_code} — {pabrik.nama_pabrik}
                            {pabrik.office_name ? (
                              <span className="block text-xs text-slate-500">
                                {t('fieldOfficerPabrikLocation', { name: pabrik.office_name })}
                              </span>
                            ) : (
                              <span className="block text-xs text-amber-700">
                                {t('fieldOfficerPabrikNoLocation')}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">{t('fieldOfficerPabriksNone')}</p>
                )}
              </div>
            )}
            {!isHeadOfFinanceRole(newUser.role) && !usesMultipleOfficesRole(newUser.role) && (
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
              )}
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
                className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-apple-fill px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-medium text-slate-900">{user.username}</div>
                  <div className="text-xs text-slate-500">
                    {translateRole(user.role)}
                    {user.full_name ? ` · ${user.full_name}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium"
                    onClick={() => openEditUser(user)}
                  >
                    {t('editUser')}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium"
                    onClick={() => {
                      setEditingUser(null);
                      setChangingPasswordFor(user.id);
                    }}
                  >
                    {t('changePassword')}
                  </button>
                  {user.role !== 'admin' && (
                    <button
                      type="button"
                      className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700"
                      onClick={() => handleDeleteUser(user.id)}
                    >
                      {t('delete')}
                    </button>
                  )}
                </div>
                {editingUser != null && Number(editingUser.id) === Number(user.id) && (
                  <form className="mt-2 w-full space-y-2 rounded-lg border border-slate-200 bg-white p-3" onSubmit={handleSaveUser}>
                    <input
                      className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                      placeholder={t('username')}
                      value={editingUser.username}
                      onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                      required
                    />
                    <select
                      className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                      value={editingUser.role}
                      onChange={(e) => {
                        const role = e.target.value;
                        setEditingUser((prev) => {
                          const next = {
                            ...prev,
                            role,
                            ...(isAttendanceRole(role) && !isAttendanceRole(prev.role)
                              ? { remote_work_allowed: true }
                              : {}),
                          };
                          if (usesMultipleOfficesRole(role) && !(prev.office_ids?.length)) {
                            next.office_ids = prev.office_id ? [String(prev.office_id)] : [];
                          }
                          return next;
                        });
                      }}
                    >
                      <option value="employee">{t('roleEmployee')}</option>
                      <option value="field_officer">{t('roleFieldOfficer')}</option>
                      <option value="umum">{t('roleUmum')}</option>
                      <option value="accounting">{t('roleAccounting')}</option>
                      <option value="general_affairs">{t('roleGeneralAffairs')}</option>
                      <option value="head_of_finance">{t('roleHeadOfFinance')}</option>
                      <option value="admin">{t('roleAdmin')}</option>
                    </select>
                    {!isHeadOfFinanceRole(editingUser.role) &&
                      (usesMultipleOfficesRole(editingUser.role) ? null : (
                        <select
                          className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                          value={editingUser.office_id}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, office_id: e.target.value })
                          }
                        >
                          <option value="">
                            {offices.length ? t('selectOffice') : t('noOfficesAvailable')}
                          </option>
                          {offices.map((office) => (
                            <option key={office.id} value={office.id}>
                              {office.name}
                            </option>
                          ))}
                        </select>
                      ))}
                    {usesMultipleOfficesRole(editingUser.role) && (
                      <div className="rounded-md border border-slate-200 bg-apple-fill p-2">
                        <p className="mb-1 text-[10px] font-medium uppercase text-slate-500">
                          {t('fieldOfficerPabriksLabel')}
                        </p>
                        <p className="mb-2 text-xs text-slate-500">{t('fieldOfficerPabriksHint')}</p>
                        {pabriks.length ? (
                          <div className="max-h-32 space-y-1 overflow-y-auto">
                            {pabriks.map((pabrik) => {
                              const idStr = String(pabrik.id);
                              const checked = (editingUser.pabrik_ids || []).includes(idStr);
                              return (
                                <label
                                  key={pabrik.id}
                                  className="flex cursor-pointer items-start gap-2 text-xs text-slate-800"
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    checked={checked}
                                    onChange={() => {
                                      setEditingUser((prev) => {
                                        const set = new Set(prev.pabrik_ids || []);
                                        if (set.has(idStr)) set.delete(idStr);
                                        else set.add(idStr);
                                        return { ...prev, pabrik_ids: [...set] };
                                      });
                                    }}
                                  />
                                  <span>
                                    {pabrik.pabrik_code} — {pabrik.nama_pabrik}
                                    {pabrik.office_name ? (
                                      <span className="block text-[10px] text-slate-500">
                                        {t('fieldOfficerPabrikLocation', { name: pabrik.office_name })}
                                      </span>
                                    ) : (
                                      <span className="block text-[10px] text-amber-700">
                                        {t('fieldOfficerPabrikNoLocation')}
                                      </span>
                                    )}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">{t('fieldOfficerPabriksNone')}</p>
                        )}
                      </div>
                    )}
                    {isAttendanceRole(editingUser.role) && (
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={editingUser.remote_work_allowed}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, remote_work_allowed: e.target.checked })
                          }
                        />
                        {t('allowRemoteWork')}
                      </label>
                    )}
                    {editingUser.role === 'employee' && (
                      <p className="text-xs text-slate-500">{t('twoClockScheduleFixed')}</p>
                    )}
                    {isGeneralAffairsRole(editingUser.role) && (
                      <>
                        <p className="text-xs text-slate-500">{t('generalAffairsOnceInOut')}</p>
                        <p className="text-xs text-slate-500">{t('generalAffairsAbsenceHint')}</p>
                        <input
                          type="number"
                          min="0"
                          className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                          placeholder={t('generalAffairsBasicSalary')}
                          value={editingUser.basic_salary}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, basic_salary: e.target.value })
                          }
                        />
                      </>
                    )}
                    {isHeadOfFinanceRole(editingUser.role) && (
                      <>
                        <p className="text-xs text-slate-500">{t('headOfFinanceNoAttendance')}</p>
                        <input
                          type="number"
                          min="0"
                          className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                          placeholder={t('headOfFinanceBasicSalary')}
                          value={editingUser.basic_salary}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, basic_salary: e.target.value })
                          }
                        />
                      </>
                    )}
                    {isAccountingRole(editingUser.role) && (
                      <>
                        <p className="text-xs text-slate-500">{t('accountingScheduleHint')}</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="block text-xs text-slate-700">
                            <span className="mb-0.5 block font-medium text-slate-600">
                              {t('accountingWorkStart')}
                            </span>
                            <input
                              type="time"
                              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                              value={editingUser.custom_work_start}
                              onChange={(e) =>
                                setEditingUser({ ...editingUser, custom_work_start: e.target.value })
                              }
                              required
                            />
                          </label>
                          <label className="block text-xs text-slate-700">
                            <span className="mb-0.5 block font-medium text-slate-600">
                              {t('accountingWorkEnd')}
                            </span>
                            <input
                              type="time"
                              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                              value={editingUser.custom_work_end}
                              onChange={(e) =>
                                setEditingUser({ ...editingUser, custom_work_end: e.target.value })
                              }
                              required
                            />
                          </label>
                        </div>
                        <input
                          type="number"
                          min="0"
                          className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                          placeholder={t('accountingBasicSalary')}
                          value={editingUser.basic_salary}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, basic_salary: e.target.value })
                          }
                        />
                      </>
                    )}
                    {requiresFullName(editingUser.role) && (
                      <input
                        className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                        placeholder={t('fullName')}
                        value={editingUser.full_name}
                        onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                        required
                      />
                    )}
                    {isAttendanceRole(editingUser.role) && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block text-xs text-slate-700">
                          <span className="mb-0.5 block font-medium text-slate-600">{t('startDate')}</span>
                          <input
                            type="date"
                            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                            value={editingUser.join_date}
                            onChange={(e) => setEditingUser({ ...editingUser, join_date: e.target.value })}
                          />
                        </label>
                        <label className="block text-xs text-slate-700">
                          <span className="mb-0.5 block font-medium text-slate-600">{t('birthday')}</span>
                          <input
                            type="date"
                            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                            value={editingUser.birthday}
                            onChange={(e) => setEditingUser({ ...editingUser, birthday: e.target.value })}
                          />
                        </label>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
                        {t('saveUser')}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs"
                        onClick={() => setEditingUser(null)}
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </form>
                )}
                {changingPasswordFor != null && Number(changingPasswordFor) === Number(user.id) && (
                  <form className="mt-2 flex w-full flex-col gap-2 sm:flex-row" onSubmit={handleChangePassword}>
                    <PasswordInput
                      className="flex-1 min-w-0"
                      inputClassName="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
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

        <div
          id="location-management"
          className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-slate-900">{t('locationManagement')}</h2>
          <p className="mt-1 text-sm text-slate-600">{t('locationManagementHint')}</p>
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
            {offices.map((office) => {
              const linkedFactories = pabriks.filter(
                (p) => Number(p.office_id) === Number(office.id)
              );
              return (
              <li
                key={office.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-apple-fill px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-900">{office.name}</div>
                    {office.link && (
                      <a
                        className="text-xs text-brand-600 hover:underline"
                        href={office.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t('mapLink')}
                      </a>
                    )}
                    {office.lat != null && office.lng != null && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {Number(office.lat).toFixed(5)}, {Number(office.lng).toFixed(5)}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-600">
                      {t('locationFactories')}:{' '}
                      {linkedFactories.length ? (
                        linkedFactories
                          .map((p) => `${p.pabrik_code} — ${p.nama_pabrik}`)
                          .join(', ')
                      ) : (
                        <span className="text-slate-400">{t('locationFactoriesNone')}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium"
                      onClick={() => openEditOffice(office)}
                    >
                      {t('editOffice')}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700"
                      onClick={() => handleDeleteOffice(office.id)}
                    >
                      {t('delete')}
                    </button>
                  </div>
                </div>
                {editingOffice != null && Number(editingOffice.id) === Number(office.id) && (
                  <form className="space-y-2 rounded-lg border border-slate-200 bg-white p-3" onSubmit={handleSaveOffice}>
                    <input
                      className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                      placeholder={t('officeName')}
                      value={editingOffice.name}
                      onChange={(e) => setEditingOffice({ ...editingOffice, name: e.target.value })}
                      required
                    />
                    <input
                      className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                      placeholder={t('locationLink')}
                      value={editingOffice.locationLink}
                      onChange={(e) =>
                        setEditingOffice({ ...editingOffice, locationLink: e.target.value })
                      }
                      required
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-500"
                      >
                        {t('saveOffice')}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium"
                        onClick={() => setEditingOffice(null)}
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </form>
                )}
              </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('attendance')}</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <label className="flex min-w-[12rem] flex-1 flex-col text-sm text-slate-600">
            <span className="mb-1 font-medium text-slate-800">{t('attendanceByUser')}</span>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              value={perUserSelectedId}
              onChange={async (e) => {
                const v = e.target.value;
                setPerUserSelectedId(v);
                if (!v) {
                  setPerUserAttendance(null);
                  return;
                }
                setPerUserLoading(true);
                try {
                  const res = await api.get(paths.userAttendance(v), { params: { limit: 200 } });
                  setPerUserAttendance(res.data);
                } catch (err) {
                  setMessage(translateApiMessage(err));
                  setPerUserAttendance(null);
                } finally {
                  setPerUserLoading(false);
                }
              }}
            >
              <option value="">{t('allRecords')}</option>
              {users.map((user) => (
                <option key={user.id} value={String(user.id)}>
                  {user.username}
                  {user.full_name ? ` — ${user.full_name}` : ''}
                </option>
              ))}
            </select>
          </label>
          {perUserLoading ? <span className="text-xs text-slate-500">{t('loading')}</span> : null}
        </div>
        {perUserSelectedId &&
        perUserAttendance &&
        perUserAttendance.user &&
        !perUserAttendance.user.employee_id ? (
          <p className="mt-2 text-sm text-slate-600">{t('noEmployeeLinkedAttendance')}</p>
        ) : null}
        <div className="mt-3 max-h-96 overflow-auto text-sm">
          <table className="min-w-full border-collapse text-left">
            <thead className="sticky top-0 bg-apple-fill text-xs font-semibold text-apple-text">
              <tr>
                <th className="border-b border-slate-200 px-2 py-2">{t('employee')}</th>
                <th className="border-b border-slate-200 px-2 py-2">{t('office')}</th>
                <th className="border-b border-slate-200 px-2 py-2">{t('status')}</th>
                <th className="border-b border-slate-200 px-2 py-2">{t('checkIn')}</th>
                <th className="border-b border-slate-200 px-2 py-2">{t('checkOut')}</th>
              </tr>
            </thead>
            <tbody>
              {(perUserSelectedId ? perUserAttendance?.attendance ?? [] : attendance).map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-2 py-2">{row.full_name || row.employee_code}</td>
                  <td className="px-2 py-2">{row.office_name}</td>
                  <td className="px-2 py-2">{translateAttendanceStatus(row.attendance_status)}</td>
                  <td className="px-2 py-2">{row.check_in ? formatDisplayDateTime(row.check_in) : ''}</td>
                  <td className="px-2 py-2">
                    {row.check_out ? formatDisplayDateTime(row.check_out) : t('notCheckedOut')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      </div>
    </AdminLayout>
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
