const { Router } = require('express');
const {
  authenticate,
  requireRole,
  requireAttendanceRole,
  requireEmployeePayrollAccess,
} = require('../../middleware/authMiddleware');
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
  userAttendanceQueryValidators,
  officeCreateValidators,
  officeUpdateValidators,
  departmentCreateValidators,
  employeeUpdateValidators,
  payrollSettingsValidators,
  payrollPeriodParamValidator,
  payrollGenerateValidators,
  payrollEntryValidators,
  payrollEmployeeDefaultsValidators,
  loanSubmitValidators,
  loanDecideValidators,
  fieldCodeSubmitValidators,
  pabrikItemRateBodyValidators,
  pabrikItemRateIdValidator,
  pabrikIdValidator,
  pabrikCreateValidators,
  pabrikUpdateValidators,
  fieldDeliveryQueryValidators,
  leaveSettingsValidators,
  leaveSubmitValidators,
  leaveDecideValidators,
} = require('../../validators/commonValidators');
const { body, param } = require('express-validator');
const { leaveDocumentUpload } = require('../../middleware/leaveUpload');

function buildProtectedRoutes(deps) {
  const r = Router();
  const {
    officeController,
    attendanceController,
    userController,
    dashboardController,
    adminEnterpriseController,
    analyticsController,
    payrollController,
    loanController,
    fieldCheckoutCodeController,
    pabrikItemRateController,
    pabrikController,
    leaveController,
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
  r.patch(
    '/offices/:id',
    requireRole('admin'),
    idParamValidator,
    officeUpdateValidators,
    validateRequest,
    officeController.update
  );
  r.delete('/offices/:id', requireRole('admin'), idParamValidator, validateRequest, officeController.remove);

  r.post(
    '/attendance/check-in',
    requireAttendanceRole,
    checkInValidators,
    validateRequest,
    attendanceController.checkIn
  );
  r.post(
    '/attendance/check-out',
    requireAttendanceRole,
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
  r.get(
    '/users/:id/attendance',
    requireRole('admin'),
    ...idParamValidator,
    ...userAttendanceQueryValidators,
    validateRequest,
    attendanceController.listForUser
  );
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

  r.get('/admin/payroll/settings', requireRole('admin'), payrollController.getSettings);
  r.get('/admin/pabriks', requireRole('admin'), pabrikController.list);
  r.post(
    '/admin/pabriks',
    requireRole('admin'),
    pabrikCreateValidators,
    validateRequest,
    pabrikController.create
  );
  r.put(
    '/admin/pabriks/:id',
    requireRole('admin'),
    pabrikUpdateValidators,
    validateRequest,
    pabrikController.update
  );
  r.delete(
    '/admin/pabriks/:id',
    requireRole('admin'),
    pabrikIdValidator,
    validateRequest,
    pabrikController.remove
  );
  r.get(
    '/admin/pabrik-item-rates',
    requireRole('admin'),
    pabrikItemRateController.list
  );
  r.post(
    '/admin/pabrik-item-rates',
    requireRole('admin'),
    pabrikItemRateBodyValidators,
    validateRequest,
    pabrikItemRateController.create
  );
  r.put(
    '/admin/pabrik-item-rates/:id',
    requireRole('admin'),
    pabrikItemRateIdValidator,
    pabrikItemRateBodyValidators,
    validateRequest,
    pabrikItemRateController.update
  );
  r.delete(
    '/admin/pabrik-item-rates/:id',
    requireRole('admin'),
    pabrikItemRateIdValidator,
    validateRequest,
    pabrikItemRateController.remove
  );
  r.put(
    '/admin/payroll/settings',
    requireRole('admin'),
    payrollSettingsValidators,
    validateRequest,
    payrollController.updateSettings
  );
  r.post(
    '/admin/payroll/periods/:period/slips/export',
    requireRole('admin'),
    ...payrollPeriodParamValidator,
    validateRequest,
    payrollController.exportAllSlips
  );
  r.post(
    '/admin/payroll/periods/:period/employees/:employeeId/slip/export',
    requireRole('admin'),
    ...payrollPeriodParamValidator,
    param('employeeId').isInt({ min: 1 }),
    validateRequest,
    payrollController.exportEmployeeSlip
  );
  r.get(
    '/admin/payroll/periods/:period/slips',
    requireRole('admin'),
    ...payrollPeriodParamValidator,
    validateRequest,
    payrollController.exportAllSlips
  );
  r.get(
    '/admin/payroll/periods/:period/employees/:employeeId/slip',
    requireRole('admin'),
    ...payrollPeriodParamValidator,
    param('employeeId').isInt({ min: 1 }),
    validateRequest,
    payrollController.exportEmployeeSlip
  );
  r.get(
    '/admin/payroll/periods/:period',
    requireRole('admin'),
    ...payrollPeriodParamValidator,
    validateRequest,
    payrollController.getPeriod
  );
  r.post(
    '/admin/payroll/periods/:period/generate',
    requireRole('admin'),
    ...payrollPeriodParamValidator,
    ...payrollGenerateValidators,
    validateRequest,
    payrollController.generatePeriod
  );
  r.put(
    '/admin/payroll/periods/:period/employees/:employeeId',
    requireRole('admin'),
    ...payrollPeriodParamValidator,
    param('employeeId').isInt({ min: 1 }),
    payrollEntryValidators,
    validateRequest,
    payrollController.updateEntry
  );
  r.put(
    '/admin/payroll/employees/:id/defaults',
    requireRole('admin'),
    idParamValidator,
    payrollEmployeeDefaultsValidators,
    validateRequest,
    payrollController.updateEmployeeDefaults
  );
  r.get(
    '/finance/field-omset/periods/:period',
    requireRole('admin', 'head_of_finance'),
    ...payrollPeriodParamValidator,
    validateRequest,
    payrollController.getFieldOfficerOmsetReport
  );

  r.post(
    '/employee/me/loans',
    requireAttendanceRole,
    loanSubmitValidators,
    validateRequest,
    loanController.submit
  );
  r.get('/employee/me/loans', requireAttendanceRole, loanController.listMine);
  r.get('/admin/loan-requests/pending', requireRole('admin'), loanController.listPending);
  r.get('/admin/loan-requests', requireRole('admin'), loanController.listAll);
  r.put(
    '/admin/loan-requests/:id',
    requireRole('admin'),
    idParamValidator,
    loanDecideValidators,
    validateRequest,
    loanController.decide
  );

  r.get('/admin/leave/settings', requireRole('admin'), leaveController.getSettings);
  r.put(
    '/admin/leave/settings',
    requireRole('admin'),
    leaveSettingsValidators,
    validateRequest,
    leaveController.updateSettings
  );
  r.get('/admin/leave-requests/pending', requireRole('admin'), leaveController.listPending);
  r.get('/admin/leave-requests', requireRole('admin'), leaveController.listAll);
  r.put(
    '/admin/leave-requests/:id',
    requireRole('admin'),
    idParamValidator,
    leaveDecideValidators,
    validateRequest,
    leaveController.decide
  );

  r.get('/employee/me/leave-balances', requireRole('employee'), leaveController.getBalances);
  r.get('/employee/me/leave-requests', requireRole('employee'), leaveController.listMine);
  r.post(
    '/employee/me/leave-requests',
    requireRole('employee'),
    leaveDocumentUpload,
    leaveSubmitValidators,
    validateRequest,
    leaveController.submit
  );
  r.get(
    '/leave-requests/:id/attachment',
    idParamValidator,
    validateRequest,
    leaveController.getAttachmentByRequestId
  );
  r.get('/leave-attachments/:filename', leaveController.getAttachmentByFilename);

  r.get('/employee/me/summary', requireAttendanceRole, dashboardController.employeeSummary);
  r.get('/employee/me/attendance', requireAttendanceRole, dashboardController.employeeHistory);
  r.get('/employee/me/payroll', requireEmployeePayrollAccess, dashboardController.employeePayroll);
  r.get(
    '/employee/field-deliveries',
    requireRole('employee'),
    fieldDeliveryQueryValidators,
    validateRequest,
    dashboardController.employeeFieldDeliveries
  );
  r.get(
    '/employee/me/field-deliveries/today',
    requireAttendanceRole,
    fieldCheckoutCodeController.listToday
  );
  r.post(
    '/employee/me/field-code',
    requireAttendanceRole,
    fieldCodeSubmitValidators,
    validateRequest,
    fieldCheckoutCodeController.submit
  );

  return r;
}

module.exports = { buildProtectedRoutes };
