const { attendanceCalendarDayStr } = require('../utils/calendarDay');
const { AppError } = require('../utils/errors');
const { isFieldOfficer } = require('../constants/roles');

/** ponytail: hard 7-day lookback; raise via config if ops need longer windows. */
const MAX_BACKDATE_DAYS = 7;

function parseYmd(value) {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return s;
}

function daysBetweenYmd(fromYmd, toYmd) {
  const a = new Date(`${fromYmd}T00:00:00Z`);
  const b = new Date(`${toYmd}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

class FieldDeliveryBackdateService {
  constructor(
    fieldDeliveryBackdateRepository,
    fieldDeliveryRepository,
    attendanceRepository = null,
    fieldCodeEntryRepository = null
  ) {
    this.fieldDeliveryBackdateRepository = fieldDeliveryBackdateRepository;
    this.fieldDeliveryRepository = fieldDeliveryRepository;
    this.attendanceRepository = attendanceRepository;
    this.fieldCodeEntryRepository = fieldCodeEntryRepository;
  }

  assertRequestedDate(requestedValidOn, today) {
    const ymd = parseYmd(requestedValidOn);
    if (!ymd) {
      throw new AppError('Invalid requested date.', 400, 'INVALID_DATE');
    }
    if (ymd >= today) {
      throw new AppError('Requested date must be before today.', 400, 'DATE_NOT_PAST');
    }
    const lag = daysBetweenYmd(ymd, today);
    if (lag > MAX_BACKDATE_DAYS) {
      throw new AppError(
        `Backdate cannot be more than ${MAX_BACKDATE_DAYS} days ago.`,
        400,
        'DATE_TOO_OLD'
      );
    }
    return ymd;
  }

  async submit(auth, deliveryId, body) {
    if (!isFieldOfficer(auth.role)) {
      throw new AppError('Only field officers can request delivery backdates.', 403, 'NOT_FIELD_OFFICER');
    }
    if (!auth.employeeId) {
      throw new AppError('Account is not linked to an employee profile.', 400, 'NO_EMPLOYEE');
    }

    const id = Number(deliveryId);
    const entry = await this.fieldDeliveryRepository.findById(id);
    if (!entry) {
      throw new AppError('Delivery entry not found.', 404, 'DELIVERY_NOT_FOUND');
    }
    if (entry.employee_id !== auth.employeeId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const hasPending = await this.fieldDeliveryBackdateRepository.hasPendingForDelivery(id);
    if (hasPending) {
      throw new AppError(
        'A pending backdate request already exists for this delivery.',
        400,
        'BACKDATE_PENDING'
      );
    }

    const today = attendanceCalendarDayStr();
    const currentValidOn = String(entry.valid_on).slice(0, 10);
    const requestedValidOn = this.assertRequestedDate(body.requested_valid_on, today);
    if (requestedValidOn === currentValidOn) {
      throw new AppError('Requested date matches the current delivery date.', 400, 'DATE_UNCHANGED');
    }

    const reason = String(body.reason || '').trim();
    if (!reason) {
      throw new AppError('Reason is required.', 400, 'REASON_REQUIRED');
    }

    try {
      return await this.fieldDeliveryBackdateRepository.create({
        employeeId: auth.employeeId,
        deliveryId: id,
        fromValidOn: currentValidOn,
        requestedValidOn,
        reason,
      });
    } catch (err) {
      if (err && err.code === 'BACKDATE_PENDING') {
        throw new AppError(
          'A pending backdate request already exists for this delivery.',
          400,
          'BACKDATE_PENDING'
        );
      }
      throw err;
    }
  }

  async listMine(auth) {
    if (!isFieldOfficer(auth.role) || !auth.employeeId) {
      throw new AppError('Only field officers can view backdate requests.', 403, 'NOT_FIELD_OFFICER');
    }
    return this.fieldDeliveryBackdateRepository.listByEmployee(auth.employeeId);
  }

  async listPending() {
    return this.fieldDeliveryBackdateRepository.listPending();
  }

  async decide(id, auth, { status }) {
    if (!['approved', 'rejected'].includes(status)) {
      throw new AppError('Invalid status.', 400, 'STATUS');
    }

    const existing = await this.fieldDeliveryBackdateRepository.findById(id);
    if (!existing || existing.approval_status !== 'pending') {
      throw new AppError('Request not found.', 404, 'NOT_FOUND');
    }

    if (status === 'approved') {
      const requestedValidOn = String(existing.requested_valid_on).slice(0, 10);
      const today = attendanceCalendarDayStr();
      this.assertRequestedDate(requestedValidOn, today);

      if (this.attendanceRepository) {
        const count = await this.attendanceRepository.countTodaySegments(
          existing.employee_id,
          requestedValidOn
        );
        if (count < 1) {
          throw new AppError(
            'Cannot approve: employee has no check-in on the requested date.',
            400,
            'CHECK_IN_REQUIRED'
          );
        }
      }
    }

    // Decide first (same order as attendance corrections) so a concurrent reject
    // cannot leave valid_on moved while the request shows rejected.
    const row = await this.fieldDeliveryBackdateRepository.setDecision(id, {
      status,
      decidedBy: auth.userId,
    });
    if (!row) {
      throw new AppError('Request not found.', 404, 'NOT_FOUND');
    }

    if (status === 'approved') {
      const requestedValidOn = String(existing.requested_valid_on).slice(0, 10);
      let attendanceId = null;
      if (this.attendanceRepository) {
        const open = await this.attendanceRepository.findOpenToday(
          existing.employee_id,
          requestedValidOn
        );
        const any =
          open ||
          (await this.attendanceRepository.findAnyToday(existing.employee_id, requestedValidOn));
        attendanceId = any?.id ?? null;
      }

      const updated = await this.fieldDeliveryRepository.updateValidOn(
        existing.delivery_id,
        requestedValidOn,
        attendanceId
      );
      if (!updated) {
        throw new AppError('Delivery entry not found.', 404, 'DELIVERY_NOT_FOUND');
      }

      if (this.fieldCodeEntryRepository) {
        const existingCode = await this.fieldCodeEntryRepository.findForEmployeeOnDate(
          existing.employee_id,
          requestedValidOn
        );
        if (!existingCode) {
          await this.fieldCodeEntryRepository.createForEmployeeOnDate(
            existing.employee_id,
            requestedValidOn
          );
        }
        if (attendanceId) {
          await this.fieldCodeEntryRepository.linkAttendance(
            existing.employee_id,
            requestedValidOn,
            attendanceId
          );
        }
      }
    }

    return row;
  }
}

module.exports = { FieldDeliveryBackdateService, MAX_BACKDATE_DAYS, parseYmd, daysBetweenYmd };
