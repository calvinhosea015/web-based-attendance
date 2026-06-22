import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AdminLayout from '../components/AdminLayout.jsx';
import AdminOverviewSection from '../components/admin/AdminOverviewSection.jsx';
import {
  Alert,
  Button,
  PasswordInput,
  PageSection,
  inputClass,
  selectClass,
} from '../components/ui.jsx';
import { api, paths, ensureCsrf, rawApi } from '../api/client.js';
import { translateApiMessage, translateAttendanceStatus, translateRole } from '../translateApi.js';
import {
  isAttendanceRole,
  isAccountingRole,
  isUmumRole,
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

function toDateTimeLocalValue(v) {
  if (v == null || v === '') return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocalValue(s) {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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
  const [message, setMessage] = useState('');
  const [changingPasswordFor, setChangingPasswordFor] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [editingAttendanceId, setEditingAttendanceId] = useState(null);
  const [attendanceEditDraft, setAttendanceEditDraft] = useState({ check_in: '', check_out: '' });
  const [attendanceSavingId, setAttendanceSavingId] = useState(null);

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
      if (isUmumRole(newUser.role) || isHeadOfFinanceRole(newUser.role)) {
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
        if (isUmumRole(editingUser.role)) {
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

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const nameA = (a.full_name || a.username || '').trim();
      const nameB = (b.full_name || b.username || '').trim();
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  }, [users]);

  const sortedOffices = useMemo(() => {
    return [...offices].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
  }, [offices]);

  const displayedAttendance = perUserSelectedId
    ? perUserAttendance?.attendance ?? []
    : attendance;

  const openEditAttendance = (row) => {
    setEditingAttendanceId(row.id);
    setAttendanceEditDraft({
      check_in: toDateTimeLocalValue(row.check_in),
      check_out: toDateTimeLocalValue(row.check_out),
    });
  };

  const handleSaveAttendance = async (e, rowId) => {
    e.preventDefault();
    setAttendanceSavingId(rowId);
    setMessage('');
    try {
      await ensureCsrf();
      const body = {
        check_in: fromDateTimeLocalValue(attendanceEditDraft.check_in),
        check_out: attendanceEditDraft.check_out
          ? fromDateTimeLocalValue(attendanceEditDraft.check_out)
          : null,
      };
      await api.patch(paths.attendanceRecord(rowId), body);
      setMessage(t('attendanceTimesUpdated'));
      setEditingAttendanceId(null);
      setAttendanceEditDraft({ check_in: '', check_out: '' });
      refresh();
    } catch (err) {
      setMessage(translateApiMessage(err));
    } finally {
      setAttendanceSavingId(null);
    }
  };

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

      <AdminOverviewSection overview={overview} chartData={chartData} />

      <section className="apple-section-grid">
        <PageSection title={t('manageUsers')}>
          <form className="space-y-3" onSubmit={handleAddUser}>
            <input
              className={inputClass}
              placeholder={t('username')}
              value={newUser.username}
              onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              required
            />
            <PasswordInput
              inputClassName={inputClass}
              placeholder={t('password')}
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              required
            />
            <p className="text-[12px] text-apple-muted">{t('passwordPolicyHint')}</p>
            <select
              className={selectClass}
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
              <option value="head_of_finance">{t('roleHeadOfFinance')}</option>
              <option value="admin">{t('roleAdmin')}</option>
            </select>
            {requiresFullName(newUser.role) && (
              <input
                className="w-full rounded-apple border border-apple-border bg-apple-fill px-3.5 py-2.5 text-[15px] text-apple-text"
                placeholder={t('fullName')}
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                required
              />
            )}
            {isAttendanceRole(newUser.role) && !isHeadOfFinanceRole(newUser.role) && (
              <label className="flex items-center gap-2 text-sm text-apple-text">
                <input
                  type="checkbox"
                  checked={newUser.remote_work_allowed}
                  onChange={(e) => setNewUser({ ...newUser, remote_work_allowed: e.target.checked })}
                />
                {t('allowRemoteWork')}
              </label>
            )}
            {newUser.role === 'employee' && (
              <p className="text-xs text-apple-label">{t('twoClockScheduleFixed')}</p>
            )}
            {isUmumRole(newUser.role) && (
              <>
                <p className="text-xs text-apple-label">{t('umumOncePerDay')}</p>
                <p className="text-xs text-apple-label">{t('umumAbsenceHint')}</p>
                <input
                  type="number"
                  min="0"
                  className="w-full rounded-apple border border-apple-border bg-apple-fill px-3.5 py-2.5 text-[15px] text-apple-text"
                  placeholder={t('umumBasicSalary')}
                  value={newUser.basic_salary}
                  onChange={(e) => setNewUser({ ...newUser, basic_salary: e.target.value })}
                />
              </>
            )}
            {isHeadOfFinanceRole(newUser.role) && (
              <>
                <p className="text-xs text-apple-label">{t('headOfFinanceNoAttendance')}</p>
                <input
                  type="number"
                  min="0"
                  className="w-full rounded-apple border border-apple-border bg-apple-fill px-3.5 py-2.5 text-[15px] text-apple-text"
                  placeholder={t('headOfFinanceBasicSalary')}
                  value={newUser.basic_salary}
                  onChange={(e) => setNewUser({ ...newUser, basic_salary: e.target.value })}
                />
              </>
            )}
            {isAccountingRole(newUser.role) && (
              <>
                <p className="text-xs text-apple-label">{t('accountingScheduleHint')}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-apple-text">
                    <span className="mb-1 block text-xs font-medium text-apple-label">
                      {t('accountingWorkStart')}
                    </span>
                    <input
                      type="time"
                      className="w-full rounded-apple border border-apple-border bg-apple-fill px-3.5 py-2.5 text-[15px] text-apple-text"
                      value={newUser.custom_work_start}
                      onChange={(e) =>
                        setNewUser({ ...newUser, custom_work_start: e.target.value })
                      }
                      required
                    />
                  </label>
                  <label className="block text-sm text-apple-text">
                    <span className="mb-1 block text-xs font-medium text-apple-label">
                      {t('accountingWorkEnd')}
                    </span>
                    <input
                      type="time"
                      className="w-full rounded-apple border border-apple-border bg-apple-fill px-3.5 py-2.5 text-[15px] text-apple-text"
                      value={newUser.custom_work_end}
                      onChange={(e) => setNewUser({ ...newUser, custom_work_end: e.target.value })}
                      required
                    />
                  </label>
                </div>
                <input
                  type="number"
                  min="0"
                  className="w-full rounded-apple border border-apple-border bg-apple-fill px-3.5 py-2.5 text-[15px] text-apple-text"
                  placeholder={t('accountingBasicSalary')}
                  value={newUser.basic_salary}
                  onChange={(e) => setNewUser({ ...newUser, basic_salary: e.target.value })}
                />
              </>
            )}
            {isAttendanceRole(newUser.role) && !isHeadOfFinanceRole(newUser.role) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-apple-text">
                  <span className="mb-1 block text-xs font-medium text-apple-label">{t('startDate')}</span>
                  <input
                    type="date"
                    className="w-full rounded-apple border border-apple-border bg-apple-fill px-3.5 py-2.5 text-[15px] text-apple-text"
                    value={newUser.join_date}
                    onChange={(e) => setNewUser({ ...newUser, join_date: e.target.value })}
                  />
                </label>
                <label className="block text-sm text-apple-text">
                  <span className="mb-1 block text-xs font-medium text-apple-label">{t('birthday')}</span>
                  <input
                    type="date"
                    className="w-full rounded-apple border border-apple-border bg-apple-fill px-3.5 py-2.5 text-[15px] text-apple-text"
                    value={newUser.birthday}
                    onChange={(e) => setNewUser({ ...newUser, birthday: e.target.value })}
                  />
                </label>
              </div>
            )}
            {usesMultipleOfficesRole(newUser.role) && (
              <div className="rounded-lg border border-black/[0.06] bg-apple-fill p-3">
                <p className="mb-2 text-xs font-medium text-apple-label">{t('fieldOfficerPabriksLabel')}</p>
                <p className="mb-2 text-xs text-apple-label">{t('fieldOfficerPabriksHint')}</p>
                {pabriks.length ? (
                  <div className="max-h-40 space-y-1.5 overflow-y-auto">
                    {pabriks.map((pabrik) => {
                      const idStr = String(pabrik.id);
                      const checked = (newUser.pabrik_ids || []).includes(idStr);
                      return (
                        <label
                          key={pabrik.id}
                          className="flex cursor-pointer items-start gap-2 text-sm text-apple-text"
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
                              <span className="block text-xs text-apple-label">
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
                  <p className="text-xs text-apple-label">{t('fieldOfficerPabriksNone')}</p>
                )}
              </div>
            )}
            {!isHeadOfFinanceRole(newUser.role) && !usesMultipleOfficesRole(newUser.role) && (
                <select
                  className="w-full rounded-apple border border-apple-border bg-apple-fill px-3.5 py-2.5 text-[15px] text-apple-text"
                  value={newUser.office_id}
                  onChange={(e) => setNewUser({ ...newUser, office_id: e.target.value })}
                >
                  {sortedOffices.length ? (
                    sortedOffices.map((office) => (
                      <option key={office.id} value={office.id}>
                        {office.name}
                      </option>
                    ))
                  ) : (
                    <option value="">{t('noOfficesAvailable')}</option>
                  )}
                </select>
              )}
            <Button type="submit" variant="primary" className="w-full">
              {t('addUser')}
            </Button>
          </form>
          <ul className="mt-6 max-h-96 divide-y divide-black/[0.04] overflow-y-auto rounded-apple-lg border border-black/[0.06]">
            {sortedUsers.map((user) => (
              <li
                key={user.id}
                className="flex flex-col gap-2 bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div>
                  <div className="font-medium text-apple-text">
                    {user.full_name || user.username}
                  </div>
                  <div className="text-xs text-apple-label">
                    {translateRole(user.role)}
                    {user.full_name ? ` · ${user.username}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-black/[0.06] bg-white px-2 py-1 text-xs font-medium"
                    onClick={() => openEditUser(user)}
                  >
                    {t('editUser')}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-black/[0.06] bg-white px-2 py-1 text-xs font-medium"
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
                  <form className="mt-2 w-full space-y-2 rounded-lg border border-black/[0.06] bg-white p-3" onSubmit={handleSaveUser}>
                    <input
                      className="w-full rounded-apple border border-apple-border bg-apple-fill px-2.5 py-2 text-[13px] text-apple-text"
                      placeholder={t('username')}
                      value={editingUser.username}
                      onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                      required
                    />
                    <select
                      className="w-full rounded-apple border border-apple-border bg-apple-fill px-2.5 py-2 text-[13px] text-apple-text"
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
                      <option value="head_of_finance">{t('roleHeadOfFinance')}</option>
                      <option value="admin">{t('roleAdmin')}</option>
                    </select>
                    {!isHeadOfFinanceRole(editingUser.role) &&
                      (usesMultipleOfficesRole(editingUser.role) ? null : (
                        <select
                          className="w-full rounded-apple border border-apple-border bg-apple-fill px-2.5 py-2 text-[13px] text-apple-text"
                          value={editingUser.office_id}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, office_id: e.target.value })
                          }
                        >
                          <option value="">
                            {offices.length ? t('selectOffice') : t('noOfficesAvailable')}
                          </option>
                          {sortedOffices.map((office) => (
                            <option key={office.id} value={office.id}>
                              {office.name}
                            </option>
                          ))}
                        </select>
                      ))}
                    {usesMultipleOfficesRole(editingUser.role) && (
                      <div className="rounded-md border border-black/[0.06] bg-apple-fill p-2">
                        <p className="mb-1 text-[10px] font-medium uppercase text-apple-label">
                          {t('fieldOfficerPabriksLabel')}
                        </p>
                        <p className="mb-2 text-xs text-apple-label">{t('fieldOfficerPabriksHint')}</p>
                        {pabriks.length ? (
                          <div className="max-h-32 space-y-1 overflow-y-auto">
                            {pabriks.map((pabrik) => {
                              const idStr = String(pabrik.id);
                              const checked = (editingUser.pabrik_ids || []).includes(idStr);
                              return (
                                <label
                                  key={pabrik.id}
                                  className="flex cursor-pointer items-start gap-2 text-xs text-apple-text"
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
                                      <span className="block text-[10px] text-apple-label">
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
                          <p className="text-xs text-apple-label">{t('fieldOfficerPabriksNone')}</p>
                        )}
                      </div>
                    )}
                    {isAttendanceRole(editingUser.role) && (
                      <label className="flex items-center gap-2 text-xs text-apple-text">
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
                      <p className="text-xs text-apple-label">{t('twoClockScheduleFixed')}</p>
                    )}
                    {isUmumRole(editingUser.role) && (
                      <>
                        <p className="text-xs text-apple-label">{t('umumOncePerDay')}</p>
                        <p className="text-xs text-apple-label">{t('umumAbsenceHint')}</p>
                        <input
                          type="number"
                          min="0"
                          className="w-full rounded-apple border border-apple-border bg-apple-fill px-2.5 py-2 text-[13px] text-apple-text"
                          placeholder={t('umumBasicSalary')}
                          value={editingUser.basic_salary}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, basic_salary: e.target.value })
                          }
                        />
                      </>
                    )}
                    {isHeadOfFinanceRole(editingUser.role) && (
                      <>
                        <p className="text-xs text-apple-label">{t('headOfFinanceNoAttendance')}</p>
                        <input
                          type="number"
                          min="0"
                          className="w-full rounded-apple border border-apple-border bg-apple-fill px-2.5 py-2 text-[13px] text-apple-text"
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
                        <p className="text-xs text-apple-label">{t('accountingScheduleHint')}</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="block text-xs text-apple-text">
                            <span className="mb-0.5 block font-medium text-apple-label">
                              {t('accountingWorkStart')}
                            </span>
                            <input
                              type="time"
                              className="w-full rounded-apple border border-apple-border bg-apple-fill px-2.5 py-2 text-[13px] text-apple-text"
                              value={editingUser.custom_work_start}
                              onChange={(e) =>
                                setEditingUser({ ...editingUser, custom_work_start: e.target.value })
                              }
                              required
                            />
                          </label>
                          <label className="block text-xs text-apple-text">
                            <span className="mb-0.5 block font-medium text-apple-label">
                              {t('accountingWorkEnd')}
                            </span>
                            <input
                              type="time"
                              className="w-full rounded-apple border border-apple-border bg-apple-fill px-2.5 py-2 text-[13px] text-apple-text"
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
                          className="w-full rounded-apple border border-apple-border bg-apple-fill px-2.5 py-2 text-[13px] text-apple-text"
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
                        className="w-full rounded-apple border border-apple-border bg-apple-fill px-2.5 py-2 text-[13px] text-apple-text"
                        placeholder={t('fullName')}
                        value={editingUser.full_name}
                        onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                        required
                      />
                    )}
                    {isAttendanceRole(editingUser.role) && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block text-xs text-apple-text">
                          <span className="mb-0.5 block font-medium text-apple-label">{t('startDate')}</span>
                          <input
                            type="date"
                            className="w-full rounded-apple border border-apple-border bg-apple-fill px-2.5 py-2 text-[13px] text-apple-text"
                            value={editingUser.join_date}
                            onChange={(e) => setEditingUser({ ...editingUser, join_date: e.target.value })}
                          />
                        </label>
                        <label className="block text-xs text-apple-text">
                          <span className="mb-0.5 block font-medium text-apple-label">{t('birthday')}</span>
                          <input
                            type="date"
                            className="w-full rounded-apple border border-apple-border bg-apple-fill px-2.5 py-2 text-[13px] text-apple-text"
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
                        className="rounded-md border border-black/[0.06] px-3 py-1 text-xs"
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
                      inputClassName="w-full rounded-md border border-black/[0.06] px-2 py-1 text-xs"
                      placeholder={t('newPassword')}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                    <button type="submit" className="rounded-full bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-500">
                      {t('change')}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-black/[0.06] px-3 py-1 text-xs"
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
        </PageSection>
      </section>

      <PageSection title={t('attendance')}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <label className="flex min-w-[12rem] flex-1 flex-col text-sm text-apple-label">
            <span className="mb-1 font-medium text-apple-text">{t('attendanceByUser')}</span>
            <select
              className={selectClass}
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
              {sortedUsers.map((user) => (
                <option key={user.id} value={String(user.id)}>
                  {user.full_name || user.username}
                  {user.full_name ? ` (${user.username})` : ''}
                </option>
              ))}
            </select>
          </label>
          {perUserLoading ? <span className="text-xs text-apple-label">{t('loading')}</span> : null}
        </div>
        {perUserSelectedId &&
        perUserAttendance &&
        perUserAttendance.user &&
        !perUserAttendance.user.employee_id ? (
          <p className="mt-2 text-sm text-apple-label">{t('noEmployeeLinkedAttendance')}</p>
        ) : null}
        <div className="apple-table-wrap mt-4 max-h-96 overflow-auto">
          <table className="apple-table">
            <thead className="apple-table-head sticky top-0">
              <tr>
                <th>{t('employee')}</th>
                <th>{t('office')}</th>
                <th>{t('status')}</th>
                <th>{t('checkIn')}</th>
                <th>{t('checkOut')}</th>
                <th className="w-28">{t('leaveActions')}</th>
              </tr>
            </thead>
            <tbody>
              {displayedAttendance.map((row) => (
                <tr key={row.id} className="apple-table-row">
                  <td>{row.full_name || row.employee_code}</td>
                  <td>{row.office_name}</td>
                  <td>{translateAttendanceStatus(row.attendance_status)}</td>
                  {editingAttendanceId != null && Number(editingAttendanceId) === Number(row.id) ? (
                    <>
                      <td colSpan={2}>
                        <form
                          className="flex flex-col gap-2 py-1 sm:flex-row sm:items-end"
                          onSubmit={(e) => handleSaveAttendance(e, row.id)}
                        >
                          <label className="flex min-w-[11rem] flex-1 flex-col text-xs text-apple-label">
                            <span className="mb-0.5 font-medium">{t('checkIn')}</span>
                            <input
                              type="datetime-local"
                              className="rounded-apple border border-apple-border bg-apple-fill px-2 py-1.5 text-[13px] text-apple-text"
                              value={attendanceEditDraft.check_in}
                              onChange={(e) =>
                                setAttendanceEditDraft((d) => ({ ...d, check_in: e.target.value }))
                              }
                              required
                            />
                          </label>
                          <label className="flex min-w-[11rem] flex-1 flex-col text-xs text-apple-label">
                            <span className="mb-0.5 font-medium">{t('checkOut')}</span>
                            <input
                              type="datetime-local"
                              className="rounded-apple border border-apple-border bg-apple-fill px-2 py-1.5 text-[13px] text-apple-text"
                              value={attendanceEditDraft.check_out}
                              onChange={(e) =>
                                setAttendanceEditDraft((d) => ({ ...d, check_out: e.target.value }))
                              }
                            />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <Button type="submit" variant="primary" size="sm" disabled={attendanceSavingId === row.id}>
                              {attendanceSavingId === row.id ? t('loading') : t('saveAttendance')}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setAttendanceEditDraft((d) => ({ ...d, check_out: '' }))}
                            >
                              {t('clearCheckOut')}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingAttendanceId(null);
                                setAttendanceEditDraft({ check_in: '', check_out: '' });
                              }}
                            >
                              {t('cancel')}
                            </Button>
                          </div>
                        </form>
                      </td>
                      <td />
                    </>
                  ) : (
                    <>
                      <td>{row.check_in ? formatDisplayDateTime(row.check_in) : ''}</td>
                      <td>{row.check_out ? formatDisplayDateTime(row.check_out) : t('notCheckedOut')}</td>
                      <td>
                        <button
                          type="button"
                          className="rounded-md border border-black/[0.06] bg-white px-2 py-1 text-xs font-medium"
                          onClick={() => openEditAttendance(row)}
                        >
                          {t('editAttendance')}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageSection>

      </div>
    </AdminLayout>
  );
}

