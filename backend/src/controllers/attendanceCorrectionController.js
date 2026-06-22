const { asyncHandler } = require('../middleware/authMiddleware');

function makeAttendanceCorrectionController(attendanceCorrectionService) {
  return {
    submitMine: asyncHandler(async (req, res) => {
      const row = await attendanceCorrectionService.submit(req.auth, req.body);
      res.status(201).json(row);
    }),
    listMine: asyncHandler(async (req, res) => {
      res.json(await attendanceCorrectionService.listMine(req.auth));
    }),
    listPending: asyncHandler(async (req, res) => {
      res.json(await attendanceCorrectionService.listPending());
    }),
    decide: asyncHandler(async (req, res) => {
      const row = await attendanceCorrectionService.decide(req.params.id, req.auth, req.body);
      res.json(row);
    }),
  };
}

module.exports = { makeAttendanceCorrectionController };
