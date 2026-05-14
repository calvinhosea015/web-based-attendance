const { asyncHandler } = require('../middleware/authMiddleware');

function makeUserController(userService, auditLogRepository) {
  const audit = (req, action, resourceType, resourceId, details = {}) =>
    auditLogRepository
      .logSecurity({
        actorUserId: req.auth.userId,
        action,
        resourceType,
        resourceId,
        details,
        ip: req.clientMeta?.ip,
        userAgent: req.clientMeta?.userAgent,
      })
      .catch(() => {});

  return {
    list: asyncHandler(async (req, res) => {
      res.json(await userService.list());
    }),
    create: asyncHandler(async (req, res) => {
      const row = await userService.createUser(req.body);
      await audit(req, 'user_create', 'user', String(row.id), { username: row.username });
      res.status(201).json(row);
    }),
    update: asyncHandler(async (req, res) => {
      const row = await userService.updateUser(req.params.id, req.body);
      await audit(req, 'user_update', 'user', String(req.params.id), { username: row.username });
      res.json(row);
    }),
    remove: asyncHandler(async (req, res) => {
      await userService.deleteUser(req.params.id);
      await audit(req, 'user_delete', 'user', String(req.params.id), {});
      res.json({ message: 'User deleted' });
    }),
    changePassword: asyncHandler(async (req, res) => {
      await userService.changePassword(req.params.id, req.body.password);
      await audit(req, 'user_password_change', 'user', String(req.params.id), {});
      res.json({ message: 'Password updated' });
    }),
  };
}

module.exports = { makeUserController };
