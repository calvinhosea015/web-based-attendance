const { createPair } = require('../middleware/csrfStore');
const { CSRF_COOKIE } = require('../middleware/csrfProtection');
const { asyncHandler } = require('../middleware/authMiddleware');

function makeAuthController(authService) {
  return {
    csrfToken: (req, res) => {
      const { sid, token } = createPair();
      res.cookie(CSRF_COOKIE, sid, {
        httpOnly: true,
        signed: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 1000,
        path: '/api',
      });
      res.json({ csrfToken: token });
    },
    login: asyncHandler(async (req, res) => {
      const { username, password } = req.body;
      const data = await authService.login(username, password, req.clientMeta);
      res.json(data);
    }),
    refresh: asyncHandler(async (req, res) => {
      const data = await authService.refresh(req.body.refreshToken, req.clientMeta);
      res.json(data);
    }),
    logout: asyncHandler(async (req, res) => {
      const data = await authService.logout(
        req.body.refreshToken,
        req.auth?.userId,
        req.clientMeta
      );
      res.json(data);
    }),
  };
}

module.exports = { makeAuthController };
