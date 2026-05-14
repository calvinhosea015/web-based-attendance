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
    const open = await this.attendanceRepository.findOpenToday(auth.employeeId, dayStr);
    const todayRow = open || (await this.attendanceRepository.findAnyToday(auth.employeeId, dayStr));
    const weekHours = await this.attendanceRepository.sumWorkHoursThisWeek(auth.employeeId);
    const employee = await this.employeeRepository.findById(auth.employeeId);

    const assignedOffice =
      userRow && userRow.office_id != null
        ? { id: userRow.office_id, name: userRow.assigned_office_name || '' }
        : null;
    const remoteWorkAllowed = userRow ? userRow.remote_work_allowed !== false : true;

    return {
      employee,
      assigned_office: assignedOffice,
      remote_work_allowed: remoteWorkAllowed,
      today: todayRow
        ? {
            status: todayRow.attendance_status,
            check_in: todayRow.check_in,
            check_out: todayRow.check_out,
            work_hours: todayRow.work_hours,
          }
        : { status: null, check_in: null, check_out: null, work_hours: null },
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
