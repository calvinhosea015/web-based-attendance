const { asyncHandler } = require('../middleware/authMiddleware');

function makeOfficeController(officeService) {
  return {
    list: asyncHandler(async (req, res) => {
      res.json(await officeService.list());
    }),
    create: asyncHandler(async (req, res) => {
      const row = await officeService.createFromMapsLink(req.body);
      res.status(201).json(row);
    }),
    remove: asyncHandler(async (req, res) => {
      await officeService.delete(req.params.id);
      res.json({ message: 'Office deleted' });
    }),
  };
}

module.exports = { makeOfficeController };
