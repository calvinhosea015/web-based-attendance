import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  PageSection,
  inputClassCompact,
  selectClass,
} from '../ui.jsx';
import { api, paths, ensureCsrf } from '../../api/client.js';
import { translateApiMessage, translateAttendanceStatus } from '../../translateApi.js';
import { formatDisplayDateTime } from '../../utils/formatDate.js';

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

export default function AttendanceManagement({ users, notify }) {
  const { t } = useTranslation();
  const [attendance, setAttendance] = useState([]);
  const [perUserSelectedId, setPerUserSelectedId] = useState('');
  const [perUserAttendance, setPerUserAttendance] = useState(null);
  const [perUserLoading, setPerUserLoading] = useState(false);
  const [editingAttendanceId, setEditingAttendanceId] = useState(null);
  const [attendanceEditDraft, setAttendanceEditDraft] = useState({ check_in: '', check_out: '' });
  const [attendanceSavingId, setAttendanceSavingId] = useState(null);

  const refreshAttendance = async () => {
    try {
      const res = await api.get(paths.attendanceAll);
      setAttendance(res.data);
      if (perUserSelectedId) {
        try {
          const ur = await api.get(paths.userAttendance(perUserSelectedId), { params: { limit: 200 } });
          setPerUserAttendance(ur.data);
        } catch (err) {
          console.error(err);
          setPerUserAttendance(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  React.useEffect(() => {
    refreshAttendance();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const nameA = (a.full_name || a.username || '').trim();
      const nameB = (b.full_name || b.username || '').trim();
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  }, [users]);

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
    try {
      await ensureCsrf();
      const body = {
        check_in: fromDateTimeLocalValue(attendanceEditDraft.check_in),
        check_out: attendanceEditDraft.check_out
          ? fromDateTimeLocalValue(attendanceEditDraft.check_out)
          : null,
      };
      await api.patch(paths.attendanceRecord(rowId), body);
      notify(t('attendanceTimesUpdated'), 'success');
      setEditingAttendanceId(null);
      setAttendanceEditDraft({ check_in: '', check_out: '' });
      refreshAttendance();
    } catch (err) {
      notify(translateApiMessage(err), 'error');
    } finally {
      setAttendanceSavingId(null);
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
      notify(translateApiMessage(err), 'error');
    }
  };

  return (
    <PageSection
      title={t('attendance')}
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={handleProfessionalExport}>
            {t('professionalReport')}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExport}>
            {t('exportExcel')}
          </Button>
        </div>
      }
    >
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
                  notify(translateApiMessage(err), 'error');
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
        <div className="apple-table-wrap mt-4 max-h-[29rem] overflow-auto">
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
                              className={inputClassCompact}
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
                              className={inputClassCompact}
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
                        <Button variant="secondary" size="sm" onClick={() => openEditAttendance(row)}>
                          {t('editAttendance')}
                        </Button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </PageSection>
  );
}
