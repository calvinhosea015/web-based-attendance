const { asyncHandler } = require('../middleware/authMiddleware');

function makeAnalyticsController(analyticsService) {
  return {
    monthlyAttendance: asyncHandler(async (req, res) => {
      const year = parseInt(req.query.year, 10) || new Date().getFullYear();
      const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
      res.json(await analyticsService.monthlyAttendance(year, month));
    }),
    departmentAttendance: asyncHandler(async (req, res) => {
      const to = req.query.date_to || new Date().toISOString().slice(0, 10);
      const from =
        req.query.date_from ||
        new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      res.json(await analyticsService.departmentAttendance(from, to));
    }),
    overtimeTrends: asyncHandler(async (req, res) => {
      const months = parseInt(req.query.months, 10) || 6;
      res.json(await analyticsService.overtimeTrends(months));
    }),
    payrollTrends: asyncHandler(async (req, res) => {
      res.json(await analyticsService.payrollTrends(parseInt(req.query.limit, 10) || 12));
    }),
  };
}

module.exports = { makeAnalyticsController };
