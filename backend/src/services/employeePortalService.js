const { AppError } = require('../utils/errors');

class EmployeePortalService {
  constructor(userRepository, attendanceRepository, employeeRepository, payrollRepository) {
    this.userRepository = userRepository;
    this.attendanceRepository = attendanceRepository;
    this.employeeRepository = employeeRepository;
    this.payrollRepository = payrollRepository;
  }

  async meSummary(auth) {
    if (!auth.employeeId) {
      throw new AppError('Account is not linked to an employee profile.', 400, 'NO_EMPLOYEE');
    }
    const userRow = await this.userRepository.findById(auth.userId);
    const dayStr = new Date().toISOString().slice(0, 10);
    const employee = await this.employeeRepository.findById(auth.employeeId);
    const dailySegments = employee && Number(employee.daily_segments) === 2 ? 2 : 1;
    const clockEventsTarget = dailySegments * 2;

    const open = await this.attendanceRepository.findOpenToday(auth.employeeId, dayStr);
    const sessions = await this.attendanceRepository.listTodaySegments(auth.employeeId, dayStr);

    let clockEventsDone = 0;
    for (const s of sessions) {
      if (s.check_in) clockEventsDone += 1;
      if (s.check_out) clockEventsDone += 1;
    }

    let nextClockAction = 'done';
    if (clockEventsDone < clockEventsTarget) {
      nextClockAction = open ? 'check_out' : 'check_in';
    }

    const todayRow = open || sessions[sessions.length - 1] || null;
    const weekHours = await this.attendanceRepository.sumWorkHoursThisWeek(auth.employeeId);

    const assignedOffice =
      userRow && userRow.office_id != null
        ? { id: userRow.office_id, name: userRow.assigned_office_name || '' }
        : null;
    const remoteWorkAllowed = userRow ? userRow.remote_work_allowed !== false : true;

    const split_shift =
      dailySegments === 2
        ? {
            segment1_start: employee?.segment1_start,
            segment1_end: employee?.segment1_end,
            segment2_start: employee?.segment2_start,
            segment2_end: employee?.segment2_end,
          }
        : null;

    /** Two clocks per day: always 07:00–16:00 (not read from DB). Four clocks: use split_shift. */
    const shift =
      dailySegments === 1
        ? {
            shift_name: 'Standard 7–4',
            start_time: '07:00:00',
            end_time: '16:00:00',
            break_duration: 60,
          }
        : null;

    return {
      employee,
      assigned_office: assignedOffice,
      remote_work_allowed: remoteWorkAllowed,
      daily_segments: dailySegments,
      clock_events_target: clockEventsTarget,
      clock_events_done: clockEventsDone,
      next_clock_action: nextClockAction,
      shift,
      split_shift,
      today: todayRow
        ? {
            status: todayRow.attendance_status,
            check_in: todayRow.check_in,
            check_out: todayRow.check_out,
            work_hours: todayRow.work_hours,
            sessions_today: sessions.map((s) => ({
              id: s.id,
              check_in: s.check_in,
              check_out: s.check_out,
              work_hours: s.work_hours,
              attendance_status: s.attendance_status,
            })),
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
