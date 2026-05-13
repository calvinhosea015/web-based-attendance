const config = require('../config/env');
const { verify } = require('./csrfStore');

const CSRF_COOKIE = 'csrf_sid';
const CSRF_HEADER = 'x-csrf-token';

function csrfProtection(req, res, next) {
  if (!config.csrfEnabled) return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sid = req.signedCookies[CSRF_COOKIE] || req.cookies[CSRF_COOKIE];
  const token = req.get(CSRF_HEADER);
  if (!verify(sid, token)) {
    return res.status(403).json({ message: 'Invalid or missing CSRF token.', code: 'CSRF' });
  }
  return next();
}

module.exports = { csrfProtection, CSRF_COOKIE, CSRF_HEADER };
