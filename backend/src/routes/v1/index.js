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
const { makeAuthController } = require('../../controllers/authController');
const { makeOfficeController } = require('../../controllers/officeController');
const { makeAttendanceController } = require('../../controllers/attendanceController');
const { makeUserController } = require('../../controllers/userController');
const { makeDashboardController } = require('../../controllers/dashboardController');
const { makeAdminEnterpriseController } = require('../../controllers/adminEnterpriseController');
const { makeAnalyticsController } = require('../../controllers/analyticsController');
const { buildAuthRoutes } = require('./auth.routes');
const { buildProtectedRoutes } = require('./protected.routes');

function buildV1Router() {
  const userRepository = new UserRepository();
  const employeeRepository = new EmployeeRepository();
  const officeRepository = new OfficeRepository();
  const attendanceRepository = new AttendanceRepository();
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
  const attendanceService = new AttendanceService(
    attendanceRepository,
    officeRepository,
    employeeRepository,
    userRepository
  );
  const userService = new UserService(userRepository, employeeRepository);
  const dashboardService = new DashboardService(
    attendanceRepository,
    employeeRepository,
    payrollRepository
  );
  const employeePortalService = new EmployeePortalService(
    userRepository,
    attendanceRepository,
    employeeRepository,
    payrollRepository
  );
  const enterpriseAdminService = new EnterpriseAdminService(
    notificationRepository,
    departmentRepository,
    employeeRepository,
    overtimeRequestRepository,
    attendanceCorrectionRepository
  );
  const analyticsService = new AnalyticsService(analyticsRepository);

  const authController = makeAuthController(authService);
  const officeController = makeOfficeController(officeService);
  const attendanceController = makeAttendanceController(attendanceService);
  const userController = makeUserController(userService, auditLogRepository);
  const dashboardController = makeDashboardController(dashboardService, employeePortalService);
  const adminEnterpriseController = makeAdminEnterpriseController(enterpriseAdminService, auditLogRepository);
  const analyticsController = makeAnalyticsController(analyticsService);

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
    })
  );
  return v1;
}

module.exports = { buildV1Router };
