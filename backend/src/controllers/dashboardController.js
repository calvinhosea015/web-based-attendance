const { asyncHandler } = require('../middleware/authMiddleware');

function makeDashboardController(dashboardService, employeePortalService) {
  return {
    adminOverview: asyncHandler(async (req, res) => {
      res.json(await dashboardService.adminOverview());
    }),
    employeeSummary: asyncHandler(async (req, res) => {
      res.json(await employeePortalService.meSummary(req.auth));
    }),
    employeeHistory: asyncHandler(async (req, res) => {
      res.json(await employeePortalService.meHistory(req.auth));
    }),
    employeePayroll: asyncHandler(async (req, res) => {
      res.json(await employeePortalService.mePayroll(req.auth));
    }),
    employeeFieldDeliveries: asyncHandler(async (req, res) => {
      const limit = req.query.limit != null ? Number(req.query.limit) : 100;
      const days = req.query.days != null ? Number(req.query.days) : 60;
      const dateFrom = req.query.date_from || req.query.from || null;
      const dateTo = req.query.date_to || req.query.to || null;
      res.json(
        await employeePortalService.listFieldOfficerDeliveries(req.auth, {
          limit,
          days,
          dateFrom,
          dateTo,
        })
      );
    }),
  };
}

module.exports = { makeDashboardController };
