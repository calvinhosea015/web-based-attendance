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
  };
}

module.exports = { makeFieldCheckoutCodeController };
