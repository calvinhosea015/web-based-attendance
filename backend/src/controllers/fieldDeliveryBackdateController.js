const { asyncHandler } = require('../middleware/authMiddleware');

function makeFieldDeliveryBackdateController(fieldDeliveryBackdateService) {
  return {
    submitMine: asyncHandler(async (req, res) => {
      const row = await fieldDeliveryBackdateService.submit(req.auth, req.params.id, req.body);
      res.status(201).json(row);
    }),
    listMine: asyncHandler(async (req, res) => {
      res.json(await fieldDeliveryBackdateService.listMine(req.auth));
    }),
    listPending: asyncHandler(async (req, res) => {
      res.json(await fieldDeliveryBackdateService.listPending());
    }),
    decide: asyncHandler(async (req, res) => {
      const row = await fieldDeliveryBackdateService.decide(req.params.id, req.auth, req.body);
      res.json(row);
    }),
  };
}

module.exports = { makeFieldDeliveryBackdateController };
