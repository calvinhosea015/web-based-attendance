import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Modal,
  PasswordInput,
  PageSection,
  inputClass,
  inputClassCompact,
  selectClass,
} from '../ui.jsx';
import { api, paths } from '../../api/client.js';
import { translateApiMessage, translateRole } from '../../translateApi.js';
import {
  isAttendanceRole,
  isAccountingRole,
  isUmumRole,
  isHeadOfFinanceRole,
  usesMultipleOfficesRole,
  requiresFullName,
  usesDailyWagePayrollRole,
} from '../../roles.js';

function toDateInputValue(v) {
  if (v == null || v === '') return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return '';
}

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

function formatUserApiError(err) {
  return translateApiMessage(err) || String(err);
}

const defaultNewUser = (offices) => ({
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

export default function UserManagement({ offices, pabriks, notify, onUsersChange }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState(defaultNewUser([]));
  const [editingUser, setEditingUser] = useState(null);
  const [changingPasswordFor, setChangingPasswordFor] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [deletingUser, setDeletingUser] = useState(null);
  const [userSearch, setUserSearch] = useState('');

  const refreshUsers = async () => {
    try {
      const res = await api.get(paths.users);
      setUsers(res.data);
      onUsersChange(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  // ponytail: initial load delegated to parent via useEffect; expose refresh for parent
  React.useEffect(() => {
    refreshUsers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!newUser.office_id && offices.length) {
      setNewUser((prev) => ({ ...prev, office_id: String(offices[0].id) }));
    }
  }, [offices]); // eslint-disable-line react-hooks/exhaustive-deps

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
      notify(t('fieldOfficerPabriksRequired'), 'error');
      return;
    }
    if (isAttendanceRole(newUser.role) && !usesMultipleOfficesRole(newUser.role) && !officeOk) {
      notify(t('officeRequiredEmployee'), 'error');
      return;
    }
    if (requiresFullName(newUser.role) && !newUser.full_name?.trim()) {
      notify(t('fullNameRequired'), 'error');
      return;
    }
    if (isAccountingRole(newUser.role)) {
      if (!newUser.custom_work_start || !newUser.custom_work_end) {
        notify(t('accountingWorkStart') + ' / ' + t('accountingWorkEnd'), 'error');
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
      notify(ec ? `${t('userAdded')} — ${t('employeeCode')}: ${ec}` : t('userAdded'), 'success');
      refreshUsers();
      setNewUser(defaultNewUser(offices));
    } catch (err) {
      notify(formatUserApiError(err), 'error');
    }
  };

  const handleDeleteUser = async (id) => {
    try {
      await api.delete(`${paths.users}/${id}`);
      notify(t('userDeleted'), 'success');
      setEditingUser((cur) => (cur && Number(cur.id) === Number(id) ? null : cur));
      refreshUsers();
    } catch (err) {
      notify(formatUserApiError(err), 'error');
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
          notify(t('fullNameRequired'), 'error');
          return;
        }
        body.full_name = fn;
        body.basic_salary = Number(editingUser.basic_salary) || 0;
        body.join_date = editingUser.join_date || null;
        body.birthday = editingUser.birthday || null;
      } else if (isAttendanceRole(editingUser.role)) {
        const fn = editingUser.full_name.trim();
        if (requiresFullName(editingUser.role) && !fn) {
          notify(t('fullNameRequired'), 'error');
          return;
        }
        if (usesMultipleOfficesRole(editingUser.role)) {
          const pabrikIds = (editingUser.pabrik_ids || [])
            .map((id) => Number(id))
            .filter((n) => Number.isFinite(n) && n >= 1);
          if (pabrikIds.length < 1) {
            notify(t('fieldOfficerPabriksRequired'), 'error');
            return;
          }
          body.pabrik_ids = pabrikIds;
        } else if (!editingUser.office_id) {
          notify(t('officeRequiredEmployee'), 'error');
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
      notify(t('userUpdated'), 'success');
      setEditingUser(null);
      refreshUsers();
    } catch (err) {
      notify(formatUserApiError(err), 'error');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    try {
      await api.put(`${paths.users}/${changingPasswordFor}/password`, { password: newPassword });
      notify(t('passwordChanged'), 'success');
      setChangingPasswordFor(null);
      setNewPassword('');
    } catch (err) {
      notify(translateApiMessage(err), 'error');
    }
  };

  return (
    <>
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
              <option value="general_affairs">{t('roleGeneralAffairs')}</option>
              <option value="umum">{t('roleUmum')}</option>
              <option value="accounting">{t('roleAccounting')}</option>
              <option value="head_of_finance">{t('roleHeadOfFinance')}</option>
              <option value="admin">{t('roleAdmin')}</option>
            </select>
            {requiresFullName(newUser.role) && (
              <input
                className={inputClass}
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
            {usesDailyWagePayrollRole(newUser.role) && newUser.role !== 'field_officer' && (
              <>
                <p className="text-xs text-apple-label">{t('fieldOnceInOnceOut')}</p>
                <p className="text-xs text-apple-label">{t('payrollGajiFormula')}</p>
              </>
            )}
            {isUmumRole(newUser.role) && (
              <>
                <p className="text-xs text-apple-label">{t('umumOncePerDay')}</p>
                <p className="text-xs text-apple-label">{t('umumAbsenceHint')}</p>
                <input
                  type="number"
                  min="0"
                  className={inputClass}
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
                  className={inputClass}
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
                      className={inputClass}
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
                      className={inputClass}
                      value={newUser.custom_work_end}
                      onChange={(e) => setNewUser({ ...newUser, custom_work_end: e.target.value })}
                      required
                    />
                  </label>
                </div>
                <input
                  type="number"
                  min="0"
                  className={inputClass}
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
                    className={inputClass}
                    value={newUser.join_date}
                    onChange={(e) => setNewUser({ ...newUser, join_date: e.target.value })}
                  />
                </label>
                <label className="block text-sm text-apple-text">
                  <span className="mb-1 block text-xs font-medium text-apple-label">{t('birthday')}</span>
                  <input
                    type="date"
                    className={inputClass}
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
                  className={inputClass}
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
          <input
            className={`${inputClass} mt-6`}
            placeholder={t('searchUsers')}
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
          />
          <ul className="mt-3 max-h-96 divide-y divide-black/[0.04] overflow-y-auto rounded-apple-lg border border-black/[0.06]">
            {sortedUsers.filter((u) => {
              if (!userSearch) return true;
              const q = userSearch.toLowerCase();
              return (u.username || '').toLowerCase().includes(q) || (u.full_name || '').toLowerCase().includes(q);
            }).map((user) => (
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
                  <Button variant="secondary" size="sm" onClick={() => openEditUser(user)}>
                    {t('editUser')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditingUser(null);
                      setChangingPasswordFor(user.id);
                    }}
                  >
                    {t('changePassword')}
                  </Button>
                  {user.role !== 'admin' && (
                    <Button variant="danger" size="sm" onClick={() => setDeletingUser(user)}>
                      {t('delete')}
                    </Button>
                  )}
                </div>
                {editingUser != null && Number(editingUser.id) === Number(user.id) && (
                  <form className="mt-2 w-full space-y-2 rounded-lg border border-black/[0.06] bg-white p-3" onSubmit={handleSaveUser}>
                    <input
                      className={inputClassCompact}
                      placeholder={t('username')}
                      value={editingUser.username}
                      onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                      required
                    />
                    <select
                      className={inputClassCompact}
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
                      <option value="general_affairs">{t('roleGeneralAffairs')}</option>
                      <option value="umum">{t('roleUmum')}</option>
                      <option value="accounting">{t('roleAccounting')}</option>
                      <option value="head_of_finance">{t('roleHeadOfFinance')}</option>
                      <option value="admin">{t('roleAdmin')}</option>
                    </select>
                    {!isHeadOfFinanceRole(editingUser.role) &&
                      (usesMultipleOfficesRole(editingUser.role) ? null : (
                        <select
                          className={inputClassCompact}
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
                      <div className="rounded-apple-lg border border-black/[0.06] bg-apple-fill p-2">
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
                    {usesDailyWagePayrollRole(editingUser.role) &&
                      editingUser.role !== 'field_officer' && (
                        <>
                          <p className="text-xs text-apple-label">{t('fieldOnceInOnceOut')}</p>
                          <p className="text-xs text-apple-label">{t('payrollGajiFormula')}</p>
                        </>
                      )}
                    {isUmumRole(editingUser.role) && (
                      <>
                        <p className="text-xs text-apple-label">{t('umumOncePerDay')}</p>
                        <p className="text-xs text-apple-label">{t('umumAbsenceHint')}</p>
                        <input
                          type="number"
                          min="0"
                          className={inputClassCompact}
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
                          className={inputClassCompact}
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
                              className={inputClassCompact}
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
                              className={inputClassCompact}
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
                          className={inputClassCompact}
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
                        className={inputClassCompact}
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
                            className={inputClassCompact}
                            value={editingUser.join_date}
                            onChange={(e) => setEditingUser({ ...editingUser, join_date: e.target.value })}
                          />
                        </label>
                        <label className="block text-xs text-apple-text">
                          <span className="mb-0.5 block font-medium text-apple-label">{t('birthday')}</span>
                          <input
                            type="date"
                            className={inputClassCompact}
                            value={editingUser.birthday}
                            onChange={(e) => setEditingUser({ ...editingUser, birthday: e.target.value })}
                          />
                        </label>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" variant="primary" size="sm">
                        {t('saveUser')}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setEditingUser(null)}>
                        {t('cancel')}
                      </Button>
                    </div>
                  </form>
                )}
                {changingPasswordFor != null && Number(changingPasswordFor) === Number(user.id) && (
                  <form className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:items-center" onSubmit={handleChangePassword}>
                    <PasswordInput
                      className="flex-1 min-w-0"
                      inputClassName={inputClassCompact}
                      placeholder={t('newPassword')}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                    <Button type="submit" variant="primary" size="sm">
                      {t('change')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setChangingPasswordFor(null);
                        setNewPassword('');
                      }}
                    >
                      {t('cancel')}
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
      </PageSection>

      {deletingUser && (
        <Modal
          title={t('delete')}
          subtitle={deletingUser.full_name || deletingUser.username}
          onClose={() => setDeletingUser(null)}
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setDeletingUser(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  handleDeleteUser(deletingUser.id);
                  setDeletingUser(null);
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          <p className="text-[15px] text-apple-text">
            {t('confirmDeleteUser', { name: deletingUser.full_name || deletingUser.username })}
          </p>
        </Modal>
      )}
    </>
  );
}
