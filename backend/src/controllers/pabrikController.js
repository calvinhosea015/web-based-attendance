const { asyncHandler } = require('../middleware/authMiddleware');

function makePabrikController(pabrikService) {
  return {
    list: asyncHandler(async (req, res) => {
      res.json({ pabriks: await pabrikService.listWithItems() });
    }),
    update: asyncHandler(async (req, res) => {
      res.json(await pabrikService.updateGoogleMaps(req.params.id, req.body));
    }),
  };
}

module.exports = { makePabrikController };
