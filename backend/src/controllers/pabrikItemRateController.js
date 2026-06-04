const { asyncHandler } = require('../middleware/authMiddleware');

function makePabrikItemRateController(pabrikItemRateService) {
  return {
    list: asyncHandler(async (_req, res) => {
      res.json(await pabrikItemRateService.list());
    }),
    create: asyncHandler(async (req, res) => {
      const row = await pabrikItemRateService.create(req.body);
      res.status(201).json(row);
    }),
    update: asyncHandler(async (req, res) => {
      const row = await pabrikItemRateService.update(req.params.id, req.body);
      res.json(row);
    }),
    remove: asyncHandler(async (req, res) => {
      await pabrikItemRateService.remove(req.params.id);
      res.status(204).send();
    }),
  };
}

module.exports = { makePabrikItemRateController };
