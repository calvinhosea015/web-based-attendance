const { Router } = require('express');
const {
  loginValidators,
  refreshValidators,
  logoutValidators,
} = require('../../validators/commonValidators');
const { validateRequest } = require('../../middleware/validateRequest');
const { loginLimiter, refreshLimiter } = require('../../middleware/rateLimiter');
const { csrfProtection } = require('../../middleware/csrfProtection');
const { optionalAuthenticate } = require('../../middleware/authMiddleware');

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login
 */
function buildAuthRoutes(authController) {
  const r = Router();
  r.get('/csrf-token', authController.csrfToken);
  r.post(
    '/login',
    csrfProtection,
    loginLimiter,
    loginValidators,
    validateRequest,
    authController.login
  );
  r.post(
    '/refresh',
    csrfProtection,
    refreshLimiter,
    refreshValidators,
    validateRequest,
    authController.refresh
  );
  r.post(
    '/logout',
    csrfProtection,
    optionalAuthenticate,
    logoutValidators,
    validateRequest,
    authController.logout
  );
  return r;
}

module.exports = { buildAuthRoutes };
