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
  };
}

module.exports = { makeDashboardController };
