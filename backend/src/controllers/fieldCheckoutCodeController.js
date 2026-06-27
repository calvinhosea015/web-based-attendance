const { asyncHandler } = require('../middleware/authMiddleware');

function makeFieldCheckoutCodeController(fieldCheckoutCodeService) {
  return {
    submit: asyncHandler(async (req, res) => {
      const result = await fieldCheckoutCodeService.submit(req.auth, req.body);
      res.status(201).json(result);
    }),
    listToday: asyncHandler(async (req, res) => {
      res.json(await fieldCheckoutCodeService.listMyDeliveriesToday(req.auth));
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
