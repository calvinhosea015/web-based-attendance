const { AppError } = require('../utils/errors');
const { query } = require('../db/pool');
class EnterpriseAdminService {
  constructor(
    notificationRepository,
    departmentRepository,
    employeeRepository,
    overtimeRequestRepository,
    attendanceCorrectionRepository
  ) {
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
         AND LOCALTIME > TIME '16:05'`
    );
    const miss = missingOut.rows[0].c;
    if (miss > 0) {
      await this.notificationRepository.insertAdminAlert({
        type: 'missing_checkout',
        title: 'Possible missing checkouts',
        body: `${miss} open attendance row(s) still checked in after end of day.`,
        payload: { count: miss },
      });
    }

    return { lateToday: lateCnt, missingCheckout: miss };
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

  async updateEmployee(id, payload) {
    const has = (k) => Object.prototype.hasOwnProperty.call(payload, k);
    const patch = {};
    if (has('photo_url')) patch.photo_url = payload.photo_url;
    if (has('contract_status')) patch.contract_status = payload.contract_status;
    if (has('department_id')) patch.department_id = payload.department_id;
    if (has('position_id')) patch.position_id = payload.position_id;
    if (has('remote_work_allowed')) patch.remote_work_allowed = payload.remote_work_allowed;
    if (has('join_date')) {
      patch.join_date =
        payload.join_date === '' || payload.join_date == null ? null : String(payload.join_date);
    }
    if (has('birthday')) {
      patch.birthday =
        payload.birthday === '' || payload.birthday == null ? null : String(payload.birthday);
    }
    const row = await this.employeeRepository.updateEnterpriseFields(Number(id), patch);
    return row;
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
