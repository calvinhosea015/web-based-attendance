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
    employeeFieldDeliveriesUncheckedCount: asyncHandler(async (req, res) => {
      const count = await employeePortalService.countUncheckedDeliveryRecaps(req.auth);
      res.json({ count });
    }),
    deliveryRecapReviewSave: asyncHandler(async (req, res) => {
      res.status(201).json(
        await employeePortalService.saveDeliveryRecapReview(req.auth, {
          delivery_entry_id: req.body.delivery_entry_id,
          is_correct: req.body.is_correct,
          notes: req.body.notes,
        })
      );
    }),
  };
}

module.exports = { makeDashboardController };
