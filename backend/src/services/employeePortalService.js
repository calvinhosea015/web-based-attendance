const { AppError } = require('../utils/errors');

class EmployeePortalService {
  constructor(attendanceRepository, employeeRepository, leaveRepository, payrollRepository) {
    this.attendanceRepository = attendanceRepository;
    this.employeeRepository = employeeRepository;
    this.leaveRepository = leaveRepository;
    this.payrollRepository = payrollRepository;
  }

  async meSummary(auth) {
    if (!auth.employeeId) {
      throw new AppError('Account is not linked to an employee profile.', 400, 'NO_EMPLOYEE');
    }
    const dayStr = new Date().toISOString().slice(0, 10);
    const open = await this.attendanceRepository.findOpenToday(auth.employeeId, dayStr);
    const todayRow = open || (await this.attendanceRepository.findAnyToday(auth.employeeId, dayStr));
    const shift = await this.employeeRepository.getCurrentShift(auth.employeeId);
    const leaveBalances = await this.leaveRepository.balances(auth.employeeId);
    const weekHours = await this.attendanceRepository.sumWorkHoursThisWeek(auth.employeeId);
    const employee = await this.employeeRepository.findById(auth.employeeId);

    return {
      employee,
      today: todayRow
        ? {
            status: todayRow.attendance_status,
            check_in: todayRow.check_in,
            check_out: todayRow.check_out,
            work_hours: todayRow.work_hours,
          }
        : { status: null, check_in: null, check_out: null, work_hours: null },
      shift,
      leaveBalances,
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

  async meLeaves(auth) {
    if (!auth.employeeId) return [];
    return this.leaveRepository.listForEmployee(auth.employeeId);
  }
}

module.exports = { EmployeePortalService };
