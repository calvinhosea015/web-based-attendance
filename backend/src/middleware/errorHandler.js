const { logger } = require('../utils/logger');
const { AppError } = require('../utils/errors');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    logger.warn(err.message, { code: err.code, status: err.statusCode, path: req.path });
    const body = { message: err.message, code: err.code };
    if (err.details) Object.assign(body, err.details);
    return res.status(err.statusCode).json(body);
  }
  logger.error(err.message, { stack: err.stack, path: req.path });
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  return res.status(status).json({
    message: status === 500 ? 'Internal server error' : err.message,
    code: 'INTERNAL',
  });
}

module.exports = { errorHandler };
