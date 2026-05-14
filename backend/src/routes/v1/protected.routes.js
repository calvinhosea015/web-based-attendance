const { Router } = require('express');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const { validateRequest } = require('../../middleware/validateRequest');
const { csrfProtection } = require('../../middleware/csrfProtection');
const { activityLogger } = require('../../middleware/activityLogger');
const {
  checkInValidators,
  checkOutValidators,
  createUserValidators,
  changePasswordValidators,
  updateUserValidators,
  idParamValidator,
  officeCreateValidators,
  departmentCreateValidators,
  employeeUpdateValidators,
} = require('../../validators/commonValidators');
const { body } = require('express-validator');

function buildProtectedRoutes(deps) {
  const r = Router();
  const {
    officeController,
    attendanceController,
    userController,
    dashboardController,
    adminEnterpriseController,
    analyticsController,
  } = deps;

  r.use(authenticate);
  r.use(activityLogger);
  r.use(csrfProtection);

  r.get('/offices', officeController.list);
  r.post(
    '/offices',
    requireRole('admin'),
    officeCreateValidators,
    validateRequest,
    officeController.create
  );
  r.delete('/offices/:id', requireRole('admin'), idParamValidator, validateRequest, officeController.remove);

  r.post(
    '/attendance/check-in',
    requireRole('employee'),
    checkInValidators,
    validateRequest,
    attendanceController.checkIn
  );
  r.post(
    '/attendance/check-out',
    requireRole('employee'),
    checkOutValidators,
    validateRequest,
    attendanceController.checkOut
  );
  r.get('/attendance/me', attendanceController.listMine);
  r.get('/attendance', requireRole('admin'), attendanceController.listAll);
  r.post('/attendance/export', requireRole('admin'), attendanceController.exportExcel);
  r.post(
    '/attendance/report/professional',
    requireRole('admin'),
    body('date_from').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    body('date_to').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    validateRequest,
    attendanceController.exportProfessionalReport
  );

  r.get('/users', requireRole('admin'), userController.list);
  r.post('/users', requireRole('admin'), createUserValidators, validateRequest, userController.create);
  r.put(
    '/users/:id',
    requireRole('admin'),
    idParamValidator,
    updateUserValidators,
    validateRequest,
    userController.update
  );
  r.delete('/users/:id', requireRole('admin'), idParamValidator, validateRequest, userController.remove);
  r.put(
    '/users/:id/password',
    requireRole('admin'),
    idParamValidator,
    changePasswordValidators,
    validateRequest,
    userController.changePassword
  );

  r.get('/admin/dashboard', requireRole('admin'), dashboardController.adminOverview);
  r.get('/admin/audit-logs', requireRole('admin'), adminEnterpriseController.listAuditLogs);
  r.get('/admin/activity-logs', requireRole('admin'), adminEnterpriseController.listActivityLogs);
  r.post('/admin/notifications/scan', requireRole('admin'), adminEnterpriseController.scanNotifications);
  r.get('/admin/notifications', requireRole('admin'), adminEnterpriseController.listNotifications);
  r.put(
    '/admin/notifications/:id/read',
    requireRole('admin'),
    idParamValidator,
    validateRequest,
    adminEnterpriseController.markNotificationRead
  );
  r.get('/admin/departments', requireRole('admin'), adminEnterpriseController.listDepartments);
  r.post(
    '/admin/departments',
    requireRole('admin'),
    departmentCreateValidators,
    validateRequest,
    adminEnterpriseController.createDepartment
  );
  r.get('/admin/overtime-requests/pending', requireRole('admin'), adminEnterpriseController.listPendingOvertime);
  r.put(
    '/admin/overtime-requests/:id',
    requireRole('admin'),
    idParamValidator,
    body('status').isIn(['approved', 'rejected']),
    validateRequest,
    adminEnterpriseController.decideOvertime
  );
  r.get(
    '/admin/attendance-corrections/pending',
    requireRole('admin'),
    adminEnterpriseController.listPendingCorrections
  );
  r.put(
    '/admin/attendance-corrections/:id',
    requireRole('admin'),
    idParamValidator,
    body('status').isIn(['approved', 'rejected']),
    validateRequest,
    adminEnterpriseController.decideCorrection
  );
  r.put(
    '/admin/employees/:id',
    requireRole('admin'),
    idParamValidator,
    employeeUpdateValidators,
    validateRequest,
    adminEnterpriseController.updateEmployee
  );

  r.get('/admin/analytics/attendance/monthly', requireRole('admin'), analyticsController.monthlyAttendance);
  r.get('/admin/analytics/attendance/departments', requireRole('admin'), analyticsController.departmentAttendance);
  r.get('/admin/analytics/overtime/trends', requireRole('admin'), analyticsController.overtimeTrends);
  r.get('/admin/analytics/payroll/trends', requireRole('admin'), analyticsController.payrollTrends);

  r.get('/employee/me/summary', requireRole('employee'), dashboardController.employeeSummary);
  r.get('/employee/me/attendance', requireRole('employee'), dashboardController.employeeHistory);
  r.get('/employee/me/payroll', requireRole('employee'), dashboardController.employeePayroll);

  return r;
}

module.exports = { buildProtectedRoutes };
