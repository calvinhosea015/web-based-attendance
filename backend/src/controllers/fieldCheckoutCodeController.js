const { asyncHandler } = require('../middleware/authMiddleware');

function makeFieldCheckoutCodeController(
  fieldCheckoutCodeService,
  fieldDeliveryBackdateRepository = null
) {
  return {
    submit: asyncHandler(async (req, res) => {
      const result = await fieldCheckoutCodeService.submit(req.auth, req.body);
      res.status(201).json(result);
    }),
    listToday: asyncHandler(async (req, res) => {
      const data = await fieldCheckoutCodeService.listMyDeliveriesToday(req.auth);
      if (fieldDeliveryBackdateRepository && req.auth?.employeeId && data.entries.length) {
        const pendingIds = await fieldDeliveryBackdateRepository.pendingDeliveryIdsForEmployee(
          req.auth.employeeId,
          data.entries.map((e) => e.id)
        );
        data.entries = data.entries.map((e) => ({
          ...e,
          pending_backdate: pendingIds.has(e.id),
        }));
      }
      res.json(data);
    }),
    listPeriod: asyncHandler(async (req, res) => {
      res.json(
        await fieldCheckoutCodeService.listMyDeliveriesForPeriod(req.auth, req.params.period)
      );
    }),
    adminUpdateDelivery: asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      res.json(await fieldCheckoutCodeService.updateDeliveryAsAdmin(req.auth, id, req.body));
    }),
    adminDeleteDelivery: asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      res.json(await fieldCheckoutCodeService.deleteDeliveryAsAdmin(req.auth, id));
    }),
  };
}

module.exports = { makeFieldCheckoutCodeController };
