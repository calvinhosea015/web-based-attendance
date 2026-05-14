const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const arr = errors.array();
    const detail = arr
      .map((e) => (typeof e.msg === 'string' && e.msg ? e.msg : `${e.type || 'field'} ${e.path || ''}`.trim()))
      .filter(Boolean)
      .join('; ');
    logger.warn('request_validation_failed', { path: req.originalUrl, errors: arr });
    return res.status(400).json({
      message: detail ? `Validation failed: ${detail}` : 'Validation failed',
      code: 'VALIDATION',
      errors: arr,
    });
  }
  next();
}

module.exports = { validateRequest };
