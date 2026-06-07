const { asyncHandler } = require('../middleware/authMiddleware');

function makePabrikController(pabrikService) {
  return {
    list: asyncHandler(async (req, res) => {
      res.json({ pabriks: await pabrikService.listWithItems() });
    }),
    create: asyncHandler(async (req, res) => {
      res.status(201).json(await pabrikService.create(req.body));
    }),
    update: asyncHandler(async (req, res) => {
      res.json(await pabrikService.update(req.params.id, req.body));
    }),
    remove: asyncHandler(async (req, res) => {
      res.json(await pabrikService.remove(req.params.id));
    }),
  };
}

module.exports = { makePabrikController };
