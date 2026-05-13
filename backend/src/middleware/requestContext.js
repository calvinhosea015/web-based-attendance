const { logger } = require('../utils/logger');

function requestContext(req, res, next) {
  const xf = req.headers['x-forwarded-for'];
  const ip = Array.isArray(xf) ? xf[0] : (xf || '').split(',')[0].trim() || req.socket.remoteAddress;
  req.clientMeta = {
    ip: ip || null,
    userAgent: req.headers['user-agent'] || null,
  };
  res.on('finish', () => {
    logger.info('http_request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ip: req.clientMeta.ip,
      userId: req.auth?.userId,
    });
  });
  next();
}

module.exports = { requestContext };
