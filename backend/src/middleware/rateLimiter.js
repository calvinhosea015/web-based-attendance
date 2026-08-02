const rateLimit = require('express-rate-limit');
const config = require('../config/env');

// ponytail: on by default; set RATE_LIMIT_ENABLED=false only for local polling noise.
const skip = () => !config.rateLimitEnabled;

const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { message: 'Too many login attempts', code: 'RATE_LIMIT' },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
});

const healthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
});

module.exports = { apiLimiter, loginLimiter, refreshLimiter, healthLimiter };
