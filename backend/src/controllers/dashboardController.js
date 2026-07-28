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
      const limit = req.query.limit != null ? Number(req.query.limit) : 5000;
      res.json(await employeePortalService.listFieldOfficerDeliveries(req.auth, { limit }));
    }),
    deliveryRecapReviewGet: asyncHandler(async (req, res) => {
      res.json(
        await employeePortalService.getDeliveryRecapReview(req.auth, {
          date_from: req.query.date_from,
          date_to: req.query.date_to,
          pabrik: req.query.pabrik,
          officer: req.query.officer,
          kode_barang: req.query.kode_barang,
        })
      );
    }),
    deliveryRecapReviewSave: asyncHandler(async (req, res) => {
      res.status(201).json(
        await employeePortalService.saveDeliveryRecapReview(req.auth, {
          scope: req.body.scope || {},
          checklist: req.body.checklist,
        })
      );
    }),
    adminDeliveryRecapReviews: asyncHandler(async (req, res) => {
      const limit = req.query.limit != null ? Number(req.query.limit) : 50;
      res.json(await employeePortalService.listDeliveryRecapReviews(req.auth, { limit }));
    }),
  };
}

module.exports = { makeDashboardController };
