const path = require('path');
const { asyncHandler } = require('../middleware/authMiddleware');
const { UPLOAD_DIR } = require('../middleware/leaveUpload');

function makeLeaveController(leaveService) {
  return {
    getSettings: asyncHandler(async (_req, res) => {
      res.json(await leaveService.getSettings());
    }),
    updateSettings: asyncHandler(async (req, res) => {
      res.json(await leaveService.updateSettings(req.body));
    }),
    getBalances: asyncHandler(async (req, res) => {
      res.json(await leaveService.getBalances(req.auth));
    }),
    submit: asyncHandler(async (req, res) => {
      const row = await leaveService.submit(req.auth, req.body, req.file);
      res.status(201).json(row);
    }),
    listMine: asyncHandler(async (req, res) => {
      res.json(await leaveService.listMine(req.auth));
    }),
    listPending: asyncHandler(async (req, res) => {
      res.json(await leaveService.listPending());
    }),
    listAll: asyncHandler(async (req, res) => {
      res.json(await leaveService.listAll(req.query));
    }),
    decide: asyncHandler(async (req, res) => {
      res.json(await leaveService.decide(req.params.id, req.auth, req.body));
    }),
    getAttachment: asyncHandler(async (req, res) => {
      const filename = await leaveService.getAttachment(req.auth, req.params.filename);
      res.sendFile(path.join(UPLOAD_DIR, filename));
    }),
  };
}

module.exports = { makeLeaveController };
