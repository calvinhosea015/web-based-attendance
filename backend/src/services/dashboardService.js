class DashboardService {
  constructor(attendanceRepository, employeeRepository, payrollRepository) {
    this.attendanceRepository = attendanceRepository;
    this.employeeRepository = employeeRepository;
    this.payrollRepository = payrollRepository;
  }

  async adminOverview() {
    const totalEmployees = await this.employeeRepository.countActive();
    const rollup = await this.attendanceRepository.todayRollup();
    const presentToday = rollup.present_like_cnt || 0;
    const lateToday = rollup.late_cnt || 0;
    const checkedIn = rollup.distinct_checked_in || 0;
    const absentToday = Math.max(0, totalEmployees - checkedIn);
    const chart = await this.attendanceRepository.seriesLastDays(30);
    const payrollSummary = await this.payrollRepository.summaryRecent(6);
    return {
      totalEmployees,
      presentToday,
      lateToday,
      absentToday,
      chart,
      payrollSummary,
    };
  }
}

module.exports = { DashboardService };
