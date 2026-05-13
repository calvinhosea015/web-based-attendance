const { AppError } = require('../utils/errors');
const { query } = require('../db/pool');

class EnterpriseAdminService {
  constructor(
    leaveRepository,
    notificationRepository,
    departmentRepository,
    employeeRepository,
    overtimeRequestRepository,
    attendanceCorrectionRepository
  ) {
    this.leaveRepository = leaveRepository;
    this.notificationRepository = notificationRepository;
    this.departmentRepository = departmentRepository;
    this.employeeRepository = employeeRepository;
    this.overtimeRequestRepository = overtimeRequestRepository;
    this.attendanceCorrectionRepository = attendanceCorrectionRepository;
  }

  async scanAlerts() {
    const late = await query(
      `SELECT COUNT(*)::int AS c FROM attendance
       WHERE check_in::date = CURRENT_DATE AND attendance_status = 'LATE'`
    );
    const lateCnt = late.rows[0].c;
    if (lateCnt > 0) {
      await this.notificationRepository.insertAdminAlert({
        type: 'late_today',
        title: 'Late attendance today',
        body: `${lateCnt} record(s) marked late today.`,
        payload: { count: lateCnt },
      });
    }

    const missingOut = await query(
      `SELECT COUNT(*)::int AS c FROM attendance a
       WHERE a.check_in::date = CURRENT_DATE
         AND a.check_out IS NULL
         AND LOCALTIME > TIME '17:00'`
    );
    const miss = missingOut.rows[0].c;
    if (miss > 0) {
      await this.notificationRepository.insertAdminAlert({
        type: 'missing_checkout',
        title: 'Possible missing checkouts',
        body: `${miss} open attendance row(s) past scheduled shift end.`,
        payload: { count: miss },
      });
    }

    const pendingLeave = await query(
      `SELECT COUNT(*)::int AS c FROM leave_requests WHERE approval_status = 'pending'`
    );
    const p = pendingLeave.rows[0].c;
    if (p > 0) {
      await this.notificationRepository.insertAdminAlert({
        type: 'leave_pending',
        title: 'Leave approvals pending',
        body: `${p} leave request(s) awaiting review.`,
        payload: { count: p },
      });
    }

    return { lateToday: lateCnt, missingCheckout: miss, pendingLeave: p };
  }

  async decideLeave(id, auth, { status, rejectionReason }) {
    if (!['approved', 'rejected'].includes(status)) {
      throw new AppError('Invalid status.', 400, 'STATUS');
    }
    const row = await this.leaveRepository.setApproval(id, {
      status,
      approverUserId: auth.userId,
      rejectionReason,
    });
    if (!row) throw new AppError('Leave request not found or already decided.', 404, 'NOT_FOUND');
    return row;
  }

  async decideOvertime(id, auth, { status }) {
    if (!['approved', 'rejected'].includes(status)) {
      throw new AppError('Invalid status.', 400, 'STATUS');
    }
    const row = await this.overtimeRequestRepository.setDecision(id, {
      status,
      decidedBy: auth.userId,
    });
    if (!row) throw new AppError('Request not found.', 404, 'NOT_FOUND');
    return row;
  }

  async decideCorrection(id, auth, { status }) {
    if (!['approved', 'rejected'].includes(status)) {
      throw new AppError('Invalid status.', 400, 'STATUS');
    }
    const row = await this.attendanceCorrectionRepository.setDecision(id, {
      status,
      decidedBy: auth.userId,
    });
    if (!row) throw new AppError('Request not found.', 404, 'NOT_FOUND');
    return row;
  }

  async updateEmployee(id, payload) {
    return this.employeeRepository.updateEnterpriseFields(id, payload);
  }

  async listAdminNotifications() {
    return this.notificationRepository.listAdminRecent(80);
  }

  async markNotificationRead(id) {
    return this.notificationRepository.markRead(id);
  }

  async createDepartment(name) {
    return this.departmentRepository.create(name);
  }
}

module.exports = { EnterpriseAdminService };
