const { AppError } = require('../utils/errors');
const { CLOCK_SEGMENTS_PER_DAY } = require('../constants/attendance');
const { isFieldOfficer, isUmum } = require('../constants/roles');
const { attendanceCalendarDayStr } = require('../utils/calendarDay');

class EmployeePortalService {
  constructor(
    userRepository,
    attendanceRepository,
    employeeRepository,
    payrollRepository,
    fieldCodeEntryRepository = null
  ) {
    this.userRepository = userRepository;
    this.attendanceRepository = attendanceRepository;
    this.employeeRepository = employeeRepository;
    this.payrollRepository = payrollRepository;
    this.fieldCodeEntryRepository = fieldCodeEntryRepository;
  }

  async meSummary(auth) {
    if (!auth.employeeId) {
      throw new AppError('Account is not linked to an employee profile.', 400, 'NO_EMPLOYEE');
    }
    const userRow = await this.userRepository.findById(auth.userId);
    const dayStr = attendanceCalendarDayStr();
    const employee = await this.employeeRepository.findById(auth.employeeId);
    const fieldOfficer = isFieldOfficer(auth.role);
    const umum = isUmum(auth.role);

    const open = await this.attendanceRepository.findOpenSession(auth.employeeId);
    const sessions = await this.attendanceRepository.listTodaySegments(auth.employeeId, dayStr);

    let clockEventsDone = 0;
    let clockEventsTarget = CLOCK_SEGMENTS_PER_DAY * 2;
    let nextClockAction;

    if (fieldOfficer) {
      for (const s of sessions) {
        if (s.check_in) clockEventsDone += 1;
        if (s.check_out) clockEventsDone += 1;
      }
      nextClockAction = open ? 'check_out' : 'check_in';
      clockEventsTarget = null;
    } else if (umum) {
      for (const s of sessions) {
        if (s.check_in) clockEventsDone += 1;
      }
      clockEventsTarget = 1;
      nextClockAction = clockEventsDone >= 1 ? 'done' : 'check_in';
    } else {
      for (const s of sessions) {
        if (s.check_in) clockEventsDone += 1;
        if (s.check_out) clockEventsDone += 1;
      }
      nextClockAction = 'done';
      if (clockEventsDone < clockEventsTarget) {
        nextClockAction = open ? 'check_out' : 'check_in';
      }
    }

    const todayRow = open || sessions[sessions.length - 1] || null;
    const weekHours = await this.attendanceRepository.sumWorkHoursThisWeek(auth.employeeId);
    const dayStrForCode = dayStr;
    const fieldCodeEntry =
      fieldOfficer && this.fieldCodeEntryRepository
        ? await this.fieldCodeEntryRepository.findForEmployeeOnDate(auth.employeeId, dayStrForCode)
        : null;
    const hasCheckoutCodeToday = fieldOfficer
      ? Boolean(fieldCodeEntry)
      : sessions.some(
          (s) => s.check_out != null && s.checkout_code != null && String(s.checkout_code).trim() !== ''
        );

    const assignedOffice =
      userRow && userRow.office_id != null
        ? { id: userRow.office_id, name: userRow.assigned_office_name || '' }
        : null;
    const remoteWorkAllowed = userRow ? userRow.remote_work_allowed !== false : true;

    const shift =
      fieldOfficer || umum
        ? null
        : {
            shift_name: 'Standard 7–4',
            start_time: '07:00:00',
            end_time: '16:00:00',
            break_duration: 60,
          };

    const mapSession = (s) => ({
      id: s.id,
      check_in: s.check_in,
      check_out: s.check_out,
      work_hours: s.work_hours,
      attendance_status: s.attendance_status,
      checkout_code: s.checkout_code ?? null,
    });

    return {
      role: auth.role,
      employee,
      assigned_office: assignedOffice,
      remote_work_allowed: remoteWorkAllowed,
      field_officer_mode: fieldOfficer,
      umum_mode: umum,
      daily_segments: fieldOfficer || umum ? null : CLOCK_SEGMENTS_PER_DAY,
      clock_events_target: clockEventsTarget,
      clock_events_done: clockEventsDone,
      next_clock_action: nextClockAction,
      has_checkout_code_today: fieldOfficer ? hasCheckoutCodeToday : null,
      shift,
      split_shift: null,
      today: todayRow
        ? {
            status: todayRow.attendance_status,
            check_in: todayRow.check_in,
            check_out: todayRow.check_out,
            work_hours: todayRow.work_hours,
            sessions_today: sessions.map(mapSession),
          }
        : {
            status: null,
            check_in: null,
            check_out: null,
            work_hours: null,
            sessions_today: [],
          },
      weekWorkHours: Number(weekHours),
    };
  }

  async meHistory(auth) {
    if (!auth.employeeId) return [];
    return this.attendanceRepository.listForEmployee(auth.employeeId);
  }

  async mePayroll(auth) {
    if (!auth.employeeId) return [];
    return this.payrollRepository.listForEmployee(auth.employeeId);
  }
}

module.exports = { EmployeePortalService };
