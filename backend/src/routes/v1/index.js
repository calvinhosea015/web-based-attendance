const { Router } = require('express');
const { UserRepository } = require('../../repositories/userRepository');
const { EmployeeRepository } = require('../../repositories/employeeRepository');
const { OfficeRepository } = require('../../repositories/officeRepository');
const { AttendanceRepository } = require('../../repositories/attendanceRepository');
const { PayrollRepository } = require('../../repositories/payrollRepository');
const { RefreshTokenRepository } = require('../../repositories/refreshTokenRepository');
const { AuditLogRepository } = require('../../repositories/auditLogRepository');
const { DepartmentRepository } = require('../../repositories/departmentRepository');
const { NotificationRepository } = require('../../repositories/notificationRepository');
const { OvertimeRequestRepository } = require('../../repositories/overtimeRequestRepository');
const { AttendanceCorrectionRepository } = require('../../repositories/attendanceCorrectionRepository');
const { AnalyticsRepository } = require('../../repositories/analyticsRepository');
const { AuthService } = require('../../services/authService');
const { OfficeService } = require('../../services/officeService');
const { AttendanceService } = require('../../services/attendanceService');
const { UserService } = require('../../services/userService');
const { DashboardService } = require('../../services/dashboardService');
const { EmployeePortalService } = require('../../services/employeePortalService');
const { EnterpriseAdminService } = require('../../services/enterpriseAdminService');
const { AnalyticsService } = require('../../services/analyticsService');
const { PayrollService } = require('../../services/payrollService');
const { LoanRequestRepository } = require('../../repositories/loanRequestRepository');
const { LeaveRequestRepository } = require('../../repositories/leaveRequestRepository');
const { LeaveSettingsRepository } = require('../../repositories/leaveSettingsRepository');
const { LoanService } = require('../../services/loanService');
const { LeaveService } = require('../../services/leaveService');
const { FieldCodeEntryRepository } = require('../../repositories/fieldCodeEntryRepository');
const { FieldCheckoutCodeService } = require('../../services/fieldCheckoutCodeService');
const { makeAuthController } = require('../../controllers/authController');
const { makeOfficeController } = require('../../controllers/officeController');
const { makeAttendanceController } = require('../../controllers/attendanceController');
const { makeUserController } = require('../../controllers/userController');
const { makeDashboardController } = require('../../controllers/dashboardController');
const { makeAdminEnterpriseController } = require('../../controllers/adminEnterpriseController');
const { makeAnalyticsController } = require('../../controllers/analyticsController');
const { makePayrollController } = require('../../controllers/payrollController');
const { makeLoanController } = require('../../controllers/loanController');
const { makeLeaveController } = require('../../controllers/leaveController');
const { makeFieldCheckoutCodeController } = require('../../controllers/fieldCheckoutCodeController');
const { buildAuthRoutes } = require('./auth.routes');
const { buildProtectedRoutes } = require('./protected.routes');

function buildV1Router() {
  const userRepository = new UserRepository();
  const employeeRepository = new EmployeeRepository();
  const officeRepository = new OfficeRepository();
  const attendanceRepository = new AttendanceRepository();
  const fieldCodeEntryRepository = new FieldCodeEntryRepository();
  const payrollRepository = new PayrollRepository();
  const refreshTokenRepository = new RefreshTokenRepository();
  const auditLogRepository = new AuditLogRepository();
  const departmentRepository = new DepartmentRepository();
  const notificationRepository = new NotificationRepository();
  const overtimeRequestRepository = new OvertimeRequestRepository();
  const attendanceCorrectionRepository = new AttendanceCorrectionRepository();
  const analyticsRepository = new AnalyticsRepository();

  const authService = new AuthService(userRepository, refreshTokenRepository, auditLogRepository);
  const officeService = new OfficeService(officeRepository);
  const fieldCheckoutCodeService = new FieldCheckoutCodeService(fieldCodeEntryRepository);
  const attendanceService = new AttendanceService(
    attendanceRepository,
    officeRepository,
    employeeRepository,
    userRepository,
    fieldCheckoutCodeService
  );
  const userService = new UserService(userRepository, employeeRepository);
  const dashboardService = new DashboardService(
    attendanceRepository,
    employeeRepository,
    payrollRepository
  );
  const loanRequestRepository = new LoanRequestRepository();
  const leaveSettingsRepository = new LeaveSettingsRepository();
  const leaveRequestRepository = new LeaveRequestRepository();
  const payrollService = new PayrollService(
    payrollRepository,
    employeeRepository,
    loanRequestRepository,
    leaveRequestRepository
  );
  const employeePortalService = new EmployeePortalService(
    userRepository,
    attendanceRepository,
    employeeRepository,
    payrollRepository,
    fieldCodeEntryRepository,
    payrollService
  );
  const enterpriseAdminService = new EnterpriseAdminService(
    notificationRepository,
    departmentRepository,
    employeeRepository,
    overtimeRequestRepository,
    attendanceCorrectionRepository
  );
  const analyticsService = new AnalyticsService(analyticsRepository);
  const loanService = new LoanService(loanRequestRepository);
  const leaveService = new LeaveService(leaveRequestRepository, leaveSettingsRepository);

  const authController = makeAuthController(authService);
  const officeController = makeOfficeController(officeService);
  const attendanceController = makeAttendanceController(attendanceService);
  const userController = makeUserController(userService, auditLogRepository);
  const dashboardController = makeDashboardController(dashboardService, employeePortalService);
  const adminEnterpriseController = makeAdminEnterpriseController(enterpriseAdminService, auditLogRepository);
  const analyticsController = makeAnalyticsController(analyticsService);
  const payrollController = makePayrollController(payrollService);
  const loanController = makeLoanController(loanService);
  const leaveController = makeLeaveController(leaveService);
  const fieldCheckoutCodeController = makeFieldCheckoutCodeController(fieldCheckoutCodeService);

  const v1 = Router();
  v1.use('/auth', buildAuthRoutes(authController));
  v1.use(
    '/',
    buildProtectedRoutes({
      officeController,
      attendanceController,
      userController,
      dashboardController,
      adminEnterpriseController,
      analyticsController,
      payrollController,
      loanController,
      leaveController,
      fieldCheckoutCodeController,
    })
  );
  return v1;
}

module.exports = { buildV1Router };
