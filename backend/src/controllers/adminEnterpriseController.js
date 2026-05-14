const { asyncHandler } = require('../middleware/authMiddleware');

function makeAdminEnterpriseController(enterpriseAdminService, auditLogRepository) {
  return {
    scanNotifications: asyncHandler(async (req, res) => {
      const summary = await enterpriseAdminService.scanAlerts();
      res.json(summary);
    }),
    listNotifications: asyncHandler(async (req, res) => {
      res.json(await enterpriseAdminService.listAdminNotifications());
    }),
    markNotificationRead: asyncHandler(async (req, res) => {
      await enterpriseAdminService.markNotificationRead(req.params.id);
      res.json({ ok: true });
    }),
    listDepartments: asyncHandler(async (req, res) => {
      res.json(await enterpriseAdminService.departmentRepository.list());
    }),
    createDepartment: asyncHandler(async (req, res) => {
      const row = await enterpriseAdminService.createDepartment(req.body.name);
      await auditLogRepository
        .logSecurity({
          actorUserId: req.auth.userId,
          action: 'department_create',
          resourceType: 'department',
          resourceId: String(row.id),
          details: { name: req.body.name },
          ip: req.clientMeta?.ip,
          userAgent: req.clientMeta?.userAgent,
        })
        .catch(() => {});
      res.status(201).json(row);
    }),
    listPendingOvertime: asyncHandler(async (req, res) => {
      res.json(await enterpriseAdminService.overtimeRequestRepository.listPending());
    }),
    decideOvertime: asyncHandler(async (req, res) => {
      const row = await enterpriseAdminService.decideOvertime(req.params.id, req.auth, req.body);
      res.json(row);
    }),
    listPendingCorrections: asyncHandler(async (req, res) => {
      res.json(await enterpriseAdminService.attendanceCorrectionRepository.listPending());
    }),
    decideCorrection: asyncHandler(async (req, res) => {
      const row = await enterpriseAdminService.decideCorrection(req.params.id, req.auth, req.body);
      res.json(row);
    }),
    updateEmployee: asyncHandler(async (req, res) => {
      const row = await enterpriseAdminService.updateEmployee(req.params.id, req.body);
      if (!row) return res.status(404).json({ message: 'Employee not found' });
      res.json(row);
    }),
    listAuditLogs: asyncHandler(async (req, res) => {
      res.json(await auditLogRepository.listAudit({ limit: 200, offset: 0 }));
    }),
    listActivityLogs: asyncHandler(async (req, res) => {
      res.json(await auditLogRepository.listActivity({ limit: 300, offset: 0 }));
    }),
  };
}

module.exports = { makeAdminEnterpriseController };
