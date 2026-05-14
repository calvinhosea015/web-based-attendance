const { AppError } = require('../utils/errors');
const { query } = require('../db/pool');
const { normalizeTimeForDb } = require('../utils/timeOfDay');

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
    const has = (k) => Object.prototype.hasOwnProperty.call(payload, k);
    const segKeys = ['segment1_start', 'segment1_end', 'segment2_start', 'segment2_end'];
    if (segKeys.some((k) => has(k)) && !segKeys.every((k) => has(k))) {
      throw new AppError('Send all four segment times together.', 400, 'SPLIT_SHIFT_TIMES');
    }
    const patch = {};
    if (has('photo_url')) patch.photo_url = payload.photo_url;
    if (has('contract_status')) patch.contract_status = payload.contract_status;
    if (has('department_id')) patch.department_id = payload.department_id;
    if (has('position_id')) patch.position_id = payload.position_id;
    if (has('remote_work_allowed')) patch.remote_work_allowed = payload.remote_work_allowed;
    if (has('daily_segments')) patch.daily_segments = Number(payload.daily_segments) === 2 ? 2 : 1;
    if (segKeys.every((k) => has(k))) {
      patch.segment1_start = normalizeTimeForDb(payload.segment1_start);
      patch.segment1_end = normalizeTimeForDb(payload.segment1_end);
      patch.segment2_start = normalizeTimeForDb(payload.segment2_start);
      patch.segment2_end = normalizeTimeForDb(payload.segment2_end);
    }
    const row = await this.employeeRepository.updateEnterpriseFields(Number(id), patch);
    if (!row) return null;
    if (has('daily_segments') && Number(payload.daily_segments) !== 2) {
      await this.employeeRepository.enforceStandardShift(Number(id));
      return this.employeeRepository.updateEnterpriseFields(Number(id), {
        segment1_start: null,
        segment1_end: null,
        segment2_start: null,
        segment2_end: null,
      });
    }
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
