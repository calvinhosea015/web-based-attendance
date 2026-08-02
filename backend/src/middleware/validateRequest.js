const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const arr = errors.array();
    // Never echo submitted values back to the client.
    const safe = arr.map(({ type, msg, path, location }) => ({ type, msg, path, location }));
    const detail = safe
      .map((e) => (typeof e.msg === 'string' && e.msg ? e.msg : `${e.type || 'field'} ${e.path || ''}`.trim()))
      .filter(Boolean)
      .join('; ');
    logger.warn('request_validation_failed', { path: req.originalUrl, errors: safe });
    return res.status(400).json({
      message: detail ? `Validation failed: ${detail}` : 'Validation failed',
      code: 'VALIDATION',
      errors: safe,
    });
  }
  next();
}

module.exports = { validateRequest };
