const path = require('path');
const { asyncHandler } = require('../middleware/authMiddleware');
const { UPLOAD_DIR } = require('../middleware/leaveUpload');

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function contentTypeForFilename(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

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
    getAttachment: asyncHandler(async (req, res, next) => {
      const filename = await leaveService.getAttachment(req.auth, req.params.filename);
      const filePath = path.join(UPLOAD_DIR, filename);
      res.type(contentTypeForFilename(filename));
      res.setHeader('Content-Disposition', 'inline');
      res.sendFile(filePath, (err) => {
        if (!err) return;
        if (err.code === 'ENOENT') {
          return res.status(404).json({ message: 'File not found.', code: 'NOT_FOUND' });
        }
        return next(err);
      });
    }),
  };
}

module.exports = { makeLeaveController };
