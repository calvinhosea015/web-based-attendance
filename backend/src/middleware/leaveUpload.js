const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { AppError } = require('../utils/errors');

const UPLOAD_DIR = path.resolve(__dirname, '../../uploads/leave');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function buildStoredFilename(originalname) {
  const ext = path.extname(originalname || '').toLowerCase() || '.jpg';
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
  return `${crypto.randomUUID()}${safeExt}`;
}

/** Keep a disk copy when possible (local dev); primary store is PostgreSQL. */
function writeDiskCopy(filename, buffer) {
  if (!buffer?.length) return;
  try {
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  } catch {
    /* ephemeral hosting may be read-only — DB blob is authoritative */
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new AppError('Only image files are allowed.', 400, 'LEAVE_ATTACHMENT_TYPE'));
    }
    cb(null, true);
  },
});

function leaveDocumentUpload(req, res, next) {
  upload.single('document')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof AppError) return next(err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError('File is too large (max 5 MB).', 400, 'LEAVE_ATTACHMENT_SIZE'));
    }
    return next(err);
  });
}

module.exports = {
  leaveDocumentUpload,
  UPLOAD_DIR,
  buildStoredFilename,
  writeDiskCopy,
  ALLOWED_MIME,
};
