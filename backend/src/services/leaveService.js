const { AppError } = require('../utils/errors');
const { mapLeaveRow, mapLeaveRows } = require('../utils/formatDbDate');
const { isStaffKantor } = require('../constants/roles');
const { buildStoredFilename, writeDiskCopy } = require('../middleware/leaveUpload');
const {
  LEAVE_TYPES,
  VALID_LEAVE_TYPES,
  LEAVE_TYPE_SETTINGS_KEYS,
  requiresAttachment,
  resolveIsPaidOnApproval,
  requiresPaidChoiceOnApproval,
} = require('../constants/leaveTypes');

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Accept YYYY-MM-DD strings or Date values from PostgreSQL. */
function parseDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function countInclusiveDays(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || end < start) return 0;
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

function quotaForType(settings, leaveType) {
  const key = LEAVE_TYPE_SETTINGS_KEYS[leaveType];
  return key ? num(settings[key]) : 0;
}

class LeaveService {
  constructor(
    leaveRequestRepository,
    leaveSettingsRepository,
    notificationRepository,
    employeeRepository
  ) {
    this.leaveRequestRepository = leaveRequestRepository;
    this.leaveSettingsRepository = leaveSettingsRepository;
    this.notificationRepository = notificationRepository;
    this.employeeRepository = employeeRepository;
  }

  async notifyAdminNewLeave(employee, row) {
    if (!this.notificationRepository || !employee || !row) return;
    const start = mapLeaveRow(row).start_date;
    const end = mapLeaveRow(row).end_date;
    await this.notificationRepository.insertAdminAlert({
      type: 'leave_request',
      title: 'New leave request',
      body: `${employee.full_name} (${employee.employee_id}) requested ${row.leave_type} leave (${start} – ${end}).`,
      payload: { requestId: row.id, employeeId: row.employee_id },
    });
  }

  assertStaffKantor(auth) {
    if (!isStaffKantor(auth.role)) {
      throw new AppError('Leave requests are only available for Staff Kantor.', 403, 'FORBIDDEN');
    }
    if (!auth.employeeId) {
      throw new AppError('Account is not linked to an employee profile.', 400, 'NO_EMPLOYEE');
    }
  }

  async getSettings() {
    const row = await this.leaveSettingsRepository.get();
    if (!row) {
      throw new AppError('Leave settings not configured.', 500, 'INTERNAL_ERROR');
    }
    return row;
  }

  async updateSettings({ medical_days_per_year, unpaid_days_per_year, paternity_days_per_year }) {
    const medical = num(medical_days_per_year);
    const unpaid = num(unpaid_days_per_year);
    const paternity = num(paternity_days_per_year);
    if (medical < 0 || unpaid < 0 || paternity < 0) {
      throw new AppError('Leave days must be zero or greater.', 400, 'LEAVE_SETTINGS');
    }
    return this.leaveSettingsRepository.update({
      medicalDaysPerYear: medical,
      unpaidDaysPerYear: unpaid,
      paternityDaysPerYear: paternity,
    });
  }

  async getBalances(auth) {
    this.assertStaffKantor(auth);
    const settings = await this.getSettings();
    const year = new Date().getFullYear();
    const types = VALID_LEAVE_TYPES;
    const balances = await Promise.all(
      types.map(async (leaveType) => {
        const quota = quotaForType(settings, leaveType);
        const used = await this.leaveRequestRepository.sumApprovedDaysInYear(
          auth.employeeId,
          leaveType,
          year
        );
        return {
          leave_type: leaveType,
          quota_days: quota,
          used_days: used,
          remaining_days: Math.max(0, quota - used),
          year,
        };
      })
    );
    return balances;
  }

  async submit(auth, payload, file) {
    this.assertStaffKantor(auth);

    const leaveType = String(payload.leave_type || '').trim();
    if (!VALID_LEAVE_TYPES.includes(leaveType)) {
      throw new AppError('Invalid leave type.', 400, 'LEAVE_TYPE');
    }

    const startDate = String(payload.start_date || '').trim();
    const endDate = String(payload.end_date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new AppError('Invalid date range.', 400, 'LEAVE_DATES');
    }
    if (endDate < startDate) {
      throw new AppError('End date must be on or after start date.', 400, 'LEAVE_DATES');
    }

    const daysCount = countInclusiveDays(startDate, endDate);
    if (daysCount <= 0) {
      throw new AppError('Invalid date range.', 400, 'LEAVE_DATES');
    }

    if (requiresAttachment(leaveType) && !file) {
      throw new AppError('Supporting document is required for medical leave.', 400, 'LEAVE_ATTACHMENT');
    }

    const settings = await this.getSettings();
    const quota = quotaForType(settings, leaveType);
    const start = parseDate(startDate);
    if (!start) {
      throw new AppError('Invalid date range.', 400, 'LEAVE_DATES');
    }
    const year = start.getFullYear();
    const used = await this.leaveRequestRepository.sumApprovedDaysInYear(
      auth.employeeId,
      leaveType,
      year
    );
    if (used + daysCount > quota) {
      throw new AppError(
        `Insufficient ${leaveType} leave balance. Remaining: ${Math.max(0, quota - used)} day(s).`,
        400,
        'LEAVE_BALANCE'
      );
    }

    const pending = await this.leaveRequestRepository.countPendingForEmployee(auth.employeeId);
    if (pending > 0) {
      throw new AppError('You already have a pending leave request.', 400, 'LEAVE_PENDING');
    }

    const overlap = await this.leaveRequestRepository.hasOverlappingRequest(
      auth.employeeId,
      startDate,
      endDate
    );
    if (overlap) {
      throw new AppError('Dates overlap with an existing leave request.', 400, 'LEAVE_OVERLAP');
    }

    const reason = payload.reason ? String(payload.reason).trim().slice(0, 2000) : null;
    let attachmentPath = null;
    let attachmentData = null;
    let attachmentMime = null;
    if (file?.buffer?.length) {
      attachmentPath = buildStoredFilename(file.originalname);
      attachmentData = file.buffer;
      attachmentMime = file.mimetype;
      writeDiskCopy(attachmentPath, file.buffer);
    }

    const row = await this.leaveRequestRepository.create({
      employeeId: auth.employeeId,
      leaveType,
      startDate,
      endDate,
      daysCount,
      attachmentPath,
      attachmentData,
      attachmentMime,
      reason,
    });
    const employee = this.employeeRepository
      ? await this.employeeRepository.findById(auth.employeeId)
      : null;
    await this.notifyAdminNewLeave(employee, row).catch(() => {});
    return mapLeaveRow(row);
  }

  async listMine(auth) {
    this.assertStaffKantor(auth);
    const rows = await this.leaveRequestRepository.listForEmployee(auth.employeeId);
    return mapLeaveRows(rows);
  }

  async listPending() {
    return mapLeaveRows(await this.leaveRequestRepository.listPending());
  }

  async listAll(query = {}) {
    const status = query.status;
    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      throw new AppError('Invalid status.', 400, 'STATUS');
    }
    return mapLeaveRows(
      await this.leaveRequestRepository.listAll({ status: status || null })
    );
  }

  async decide(id, auth, { status, rejection_reason, is_paid }) {
    if (!['approved', 'rejected'].includes(status)) {
      throw new AppError('Invalid status.', 400, 'STATUS');
    }

    const existing = await this.leaveRequestRepository.findById(Number(id));
    if (!existing || existing.approval_status !== 'pending') {
      throw new AppError('Request not found or already decided.', 404, 'NOT_FOUND');
    }

    let isPaid = null;
    if (status === 'approved') {
      isPaid = resolveIsPaidOnApproval(existing.leave_type, is_paid);
      if (requiresPaidChoiceOnApproval(existing.leave_type) && isPaid === null) {
        throw new AppError(
          'Choose whether paternity leave is paid or unpaid when approving.',
          400,
          'LEAVE_PAID_REQUIRED'
        );
      }

      const settings = await this.getSettings();
      const quota = quotaForType(settings, existing.leave_type);
      const start = parseDate(existing.start_date);
      if (!start) {
        throw new AppError('Invalid leave start date on request.', 400, 'LEAVE_DATES');
      }
      const year = start.getFullYear();
      const used = await this.leaveRequestRepository.sumApprovedDaysInYear(
        existing.employee_id,
        existing.leave_type,
        year
      );
      if (used + num(existing.days_count) > quota) {
        throw new AppError(
          'Employee no longer has enough leave balance for this request.',
          400,
          'LEAVE_BALANCE'
        );
      }
    }

    const row = await this.leaveRequestRepository.setDecision(Number(id), {
      status,
      approvedBy: auth.userId,
      rejectionReason: status === 'rejected' ? rejection_reason : null,
      isPaid,
    });
    if (!row) throw new AppError('Request not found or already decided.', 404, 'NOT_FOUND');
    return mapLeaveRow(row);
  }

  assertCanViewAttachment(auth, row) {
    if (!row?.attachment_path) {
      throw new AppError('File not found.', 404, 'NOT_FOUND');
    }
    if (auth.role === 'admin') return;
    if (isStaffKantor(auth.role) && auth.employeeId === row.employee_id) return;
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  async getAttachmentByRequestId(auth, requestId) {
    const row = await this.leaveRequestRepository.findById(Number(requestId));
    if (!row) throw new AppError('File not found.', 404, 'NOT_FOUND');
    this.assertCanViewAttachment(auth, row);
    return row;
  }

  async getAttachmentByFilename(auth, filenameParam) {
    const safe = pathBasename(decodeURIComponent(String(filenameParam || '')));
    if (!safe) throw new AppError('Invalid file.', 400, 'NOT_FOUND');

    const row = await this.leaveRequestRepository.findByAttachment(safe);
    if (!row) throw new AppError('File not found.', 404, 'NOT_FOUND');
    this.assertCanViewAttachment(auth, row);
    return row;
  }
}

function pathBasename(name) {
  return String(name || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop();
}

module.exports = { LeaveService, countInclusiveDays };
