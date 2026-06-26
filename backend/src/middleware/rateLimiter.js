const rateLimit = require('express-rate-limit');
const config = require('../config/env');

// ponytail: limiters are noise in local dev (background polling blows the budget); only enforce in production.
const skip = () => config.nodeEnv !== 'production';

const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
});

module.exports = { apiLimiter, loginLimiter, refreshLimiter };
