const path = require('path');
const { asyncHandler } = require('../middleware/authMiddleware');
const { UPLOAD_DIR } = require('../middleware/leaveUpload');
const { attachmentBuffer, stripAttachmentData } = require('../utils/leaveAttachmentBuffer');

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

function sendAttachmentRow(res, row, next) {
  const mime = row.attachment_mime || contentTypeForFilename(row.attachment_path);
  const buf = attachmentBuffer(row);

  if (buf) {
    res.type(mime);
    res.setHeader('Content-Disposition', 'inline');
    return res.send(buf);
  }

  const filePath = path.join(UPLOAD_DIR, row.attachment_path);
  res.type(mime);
  res.setHeader('Content-Disposition', 'inline');
  return res.sendFile(filePath, (err) => {
    if (!err) return;
    if (err.code === 'ENOENT') {
      return res.status(404).json({
        message: 'Document file not found. Please submit the leave request again with the photo.',
        code: 'NOT_FOUND',
      });
    }
    return next(err);
  });
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
      res.status(201).json(stripAttachmentData(row));
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
      const row = await leaveService.decide(req.params.id, req.auth, req.body);
      res.json(stripAttachmentData(row));
    }),
    getAttachmentByRequestId: asyncHandler(async (req, res, next) => {
      const row = await leaveService.getAttachmentByRequestId(req.auth, req.params.id);
      sendAttachmentRow(res, row, next);
    }),
    getAttachmentByFilename: asyncHandler(async (req, res, next) => {
      const row = await leaveService.getAttachmentByFilename(req.auth, req.params.filename);
      sendAttachmentRow(res, row, next);
    }),
  };
}

module.exports = { makeLeaveController };
