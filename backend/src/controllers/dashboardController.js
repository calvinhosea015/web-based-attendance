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
      res.json(
        await employeePortalService.listFieldOfficerDeliveries(req.auth, { limit, days })
      );
    }),
  };
}

module.exports = { makeDashboardController };
