const { logger } = require('../utils/logger');
const config = require('../config/env');
const { AuditLogRepository } = require('../repositories/auditLogRepository');

const auditRepo = new AuditLogRepository();

function activityLogger(req, res, next) {
  if (!config.activityLogEnabled) return next();
  const start = Date.now();
  res.on('finish', () => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
    if (!req.auth?.userId) return;
    auditRepo
      .logActivity({
        userId: req.auth.userId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        statusCode: res.statusCode,
        ip: req.clientMeta?.ip,
        userAgent: req.clientMeta?.userAgent,
        durationMs: Date.now() - start,
      })
      .catch((e) => logger.warn('activity_log_failed', { message: e.message }));
  });
  next();
}

module.exports = { activityLogger };
