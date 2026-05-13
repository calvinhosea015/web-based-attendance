class AnalyticsService {
  constructor(analyticsRepository) {
    this.analyticsRepository = analyticsRepository;
  }

  async monthlyAttendance(year, month) {
    return this.analyticsRepository.monthlyAttendance(year, month);
  }

  async departmentAttendance(from, to) {
    return this.analyticsRepository.departmentAttendance(from, to);
  }

  async overtimeTrends(months) {
    return this.analyticsRepository.overtimeTrends(months);
  }

  async payrollTrends(limit) {
    return this.analyticsRepository.payrollTrends(limit);
  }
}

module.exports = { AnalyticsService };
