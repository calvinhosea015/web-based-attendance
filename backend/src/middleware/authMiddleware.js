const jwt = require('jsonwebtoken');
const config = require('../config/env');

function extractBearer(req) {
  const h = req.headers.authorization;
  if (!h) return null;
  if (h.startsWith('Bearer ')) return h.slice(7);
  return h;
}

function authenticate(req, res, next) {
  const token = extractBearer(req);
  if (!token) {
    return res.status(401).json({ message: 'No token provided.' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.auth = {
      userId: payload.sub,
      role: payload.role,
      employeeId: payload.employeeId || null,
    };
    return next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Access token expired.',
        code: 'TOKEN_EXPIRED',
      });
    }
    return res.status(401).json({ message: 'Failed to authenticate token.' });
  }
}

function optionalAuthenticate(req, res, next) {
  const token = extractBearer(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.auth = {
      userId: payload.sub,
      role: payload.role,
      employeeId: payload.employeeId || null,
    };
  } catch {
    /* ignore invalid token for optional auth */
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { authenticate, optionalAuthenticate, requireRole, asyncHandler };
