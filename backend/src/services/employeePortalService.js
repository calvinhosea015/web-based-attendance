const { AppError } = require('../utils/errors');
const config = require('../config/env');
const { CLOCK_SEGMENTS_PER_DAY } = require('../constants/attendance');
const {
  isFieldOfficer,
  isGeneralAffairs,
  isUmum,
  isStaffKantor,
  isAccounting,
  usesOncePerDayInOut,
  usesCheckInOnlyClock,
  usesDailyWagePayroll,
  normalizeGaClockMode,
} = require('../constants/roles');
const { customShiftFromEmployee } = require('../utils/customWorkShift');
const { attendanceCalendarDayStr } = require('../utils/calendarDay');
const {
  resolveAssignedOfficesForEmployee,
  primaryOfficeFromList,
} = require('../utils/employeeOffices');

class EmployeePortalService {
  constructor(
    userRepository,
    attendanceRepository,
    employeeRepository,
    payrollRepository,
    fieldCodeEntryRepository = null,
    fieldDeliveryRepository = null,
    payrollService = null,
    employeeOfficeRepository = null,
    employeePabrikRepository = null,
    deliveryRecapReviewRepository = null,
    notificationRepository = null
  ) {
    this.userRepository = userRepository;
    this.attendanceRepository = attendanceRepository;
    this.employeeRepository = employeeRepository;
    this.payrollRepository = payrollRepository;
    this.fieldCodeEntryRepository = fieldCodeEntryRepository;
    this.fieldDeliveryRepository = fieldDeliveryRepository;
    this.payrollService = payrollService;
    this.employeeOfficeRepository = employeeOfficeRepository;
    this.employeePabrikRepository = employeePabrikRepository;
    this.deliveryRecapReviewRepository = deliveryRecapReviewRepository;
    this.notificationRepository = notificationRepository;
  }

  async meSummary(auth) {
    if (!auth.employeeId) {
      throw new AppError('Account is not linked to an employee profile.', 400, 'NO_EMPLOYEE');
    }
    const userRow = await this.userRepository.findById(auth.userId);
    const dayStr = attendanceCalendarDayStr();
    const employee = await this.employeeRepository.findById(auth.employeeId);
    const fieldOfficer = isFieldOfficer(auth.role);
    const generalAffairs = isGeneralAffairs(auth.role);
    const umum = isUmum(auth.role);
    const accounting = isAccounting(auth.role);
    const gaClockMode = generalAffairs ? normalizeGaClockMode(employee?.ga_clock_mode) : null;
    const checkInOnly = usesCheckInOnlyClock(auth.role, employee?.ga_clock_mode);
    const onceDailyInOut = usesOncePerDayInOut(auth.role, employee?.ga_clock_mode);

    const open = await this.attendanceRepository.findOpenSession(auth.employeeId);
    const sessions = await this.attendanceRepository.listTodaySegments(auth.employeeId, dayStr);

    let clockEventsDone = 0;
    let clockEventsTarget = CLOCK_SEGMENTS_PER_DAY * 2;
    let nextClockAction;

    if (onceDailyInOut) {
      const hasCheckInToday = sessions.length > 0;
      const completedToday = sessions.some((s) => s.check_out != null);
      clockEventsDone = hasCheckInToday ? (completedToday ? 2 : 1) : 0;
      clockEventsTarget = 2;
      if (!hasCheckInToday) {
        nextClockAction = 'check_in';
      } else if (open || !completedToday) {
        nextClockAction = 'check_out';
      } else {
        nextClockAction = 'done';
      }
    } else if (checkInOnly) {
      for (const s of sessions) {
        if (s.check_in) clockEventsDone += 1;
      }
      clockEventsTarget = 1;
      nextClockAction = clockEventsDone >= 1 ? 'done' : 'check_in';
    } else {
      for (const s of sessions) {
        if (s.check_in) clockEventsDone += 1;
        if (s.check_out) clockEventsDone += 1;
      }
      nextClockAction = 'done';
      if (clockEventsDone < clockEventsTarget) {
        nextClockAction = open ? 'check_out' : 'check_in';
      }
    }

    const todayRow = open || sessions[sessions.length - 1] || null;
    const weekHours = await this.attendanceRepository.sumWorkHoursThisWeek(auth.employeeId);
    const dayStrForCode = dayStr;
    let hasCheckoutCodeToday;
    if (fieldOfficer) {
      if (this.fieldDeliveryRepository) {
        const count = await this.fieldDeliveryRepository.countForEmployeeOnDate(
          auth.employeeId,
          dayStrForCode
        );
        hasCheckoutCodeToday = count > 0;
      } else if (this.fieldCodeEntryRepository) {
        const fieldCodeEntry = await this.fieldCodeEntryRepository.findForEmployeeOnDate(
          auth.employeeId,
          dayStrForCode
        );
        hasCheckoutCodeToday = Boolean(fieldCodeEntry);
      } else {
        hasCheckoutCodeToday = false;
      }
    } else {
      hasCheckoutCodeToday = sessions.some(
          (s) => s.check_out != null && s.checkout_code != null && String(s.checkout_code).trim() !== ''
      );
    }

    const assignedOffices = await resolveAssignedOfficesForEmployee(
      this.employeeOfficeRepository,
      auth.employeeId,
      userRow,
      this.employeePabrikRepository
    );
    const assignedOffice = primaryOfficeFromList(assignedOffices);
    const remoteWorkAllowed = userRow ? userRow.remote_work_allowed !== false : true;

    let shift;
    if (onceDailyInOut || checkInOnly) {
      shift = null;
    } else if (accounting) {
      shift = customShiftFromEmployee(employee);
    } else {
      shift = {
        shift_name: 'Standard 7–4',
        start_time: '07:15:00',
        end_time: '16:00:00',
        break_duration: 60,
      };
    }

    const mapSession = (s) => ({
      id: s.id,
      check_in: s.check_in,
      check_out: s.check_out,
      work_hours: s.work_hours,
      attendance_status: s.attendance_status,
      checkout_code: s.checkout_code ?? null,
    });

    return {
      role: auth.role,
      employee,
      assigned_office: assignedOffice,
      assigned_offices: assignedOffices,
      assigned_location_count: assignedOffices.length,
      check_in_radius_meters: config.officeRadiusMeters,
      check_in_gps_buffer_cap_meters: config.officeRadiusGpsBufferCapMeters,
      remote_work_allowed: remoteWorkAllowed,
      field_officer_mode: fieldOfficer,
      general_affairs_mode: generalAffairs,
      ga_clock_mode: gaClockMode,
      daily_wage_mode: usesDailyWagePayroll(auth.role),
      umum_mode: umum,
      check_in_only_mode: checkInOnly,
      accounting_mode: accounting,
      once_daily_in_out_mode: onceDailyInOut,
      daily_segments: onceDailyInOut || checkInOnly ? null : CLOCK_SEGMENTS_PER_DAY,
      clock_events_target: clockEventsTarget,
      clock_events_done: clockEventsDone,
      next_clock_action: nextClockAction,
      has_checkout_code_today: fieldOfficer ? hasCheckoutCodeToday : null,
      shift,
      split_shift: null,
      today: todayRow
        ? {
            status: todayRow.attendance_status,
            check_in: todayRow.check_in,
            check_out: todayRow.check_out,
            work_hours: todayRow.work_hours,
            sessions_today: sessions.map(mapSession),
          }
        : {
            status: null,
            check_in: null,
            check_out: null,
            work_hours: null,
            sessions_today: [],
          },
      weekWorkHours: Number(weekHours),
    };
  }

  async meHistory(auth) {
    if (!auth.employeeId) return [];
    return this.attendanceRepository.listForEmployee(auth.employeeId);
  }

  async mePayroll(auth) {
    if (!auth.employeeId) return [];
    if (this.payrollService) {
      return this.payrollService.listPayrollForEmployee(auth.employeeId);
    }
    return this.payrollRepository.listForEmployee(auth.employeeId);
  }

  async listFieldOfficerDeliveries(auth, { limit = 5000 } = {}) {
    if (!isStaffKantor(auth.role) && !isAccounting(auth.role)) {
      throw new AppError(
        'Only Staff Kantor and Accounting can view field delivery data.',
        403,
        'FORBIDDEN'
      );
    }
    if (!this.fieldDeliveryRepository) return [];
    const safeLimit = Math.min(5000, Math.max(1, Number(limit) || 5000));
    const rows = await this.fieldDeliveryRepository.listAll({ limit: safeLimit });
    const reviewMap =
      this.deliveryRecapReviewRepository
        ? await this.deliveryRecapReviewRepository.mapLatestByDeliveryIds(rows.map((r) => r.id))
        : new Map();
    return rows.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      employee_code: row.employee_code,
      office_name: row.office_name,
      valid_on: row.valid_on ?? null,
      created_at: row.created_at ?? null,
      check_out: row.check_out ?? null,
      checkout_code: row.checkout_code,
      pabrik_code: row.pabrik_code ?? null,
      nama_pabrik: row.nama_pabrik ?? null,
      norek: row.norek ?? null,
      nomor_tanda_terima: row.nomor_tanda_terima ?? null,
      nomor_surat_jalan: row.nomor_surat_jalan ?? null,
      nopol: row.nopol ?? null,
      no_bs: row.no_bs ?? null,
      kode_barang: row.kode_barang ?? null,
      kotor: row.kotor ?? null,
      berat_bersih: row.berat_bersih ?? null,
      selisih: row.selisih ?? null,
      tonase_per_item: row.tonase_per_item ?? null,
      price_per_item: row.price_per_item ?? null,
      omset_amount: row.omset_amount ?? null,
      bonus_amount: row.bonus_amount ?? null,
      recap_review: this.formatDeliveryRecapReview(reviewMap.get(Number(row.id))),
    }));
  }

  formatDeliveryRecapReview(row) {
    if (!row) return null;
    return {
      id: row.id,
      delivery_entry_id: row.delivery_entry_id ?? null,
      is_correct: row.is_correct ?? null,
      notes: row.notes ?? null,
      reviewed_by: row.reviewed_by,
      reviewed_at: row.reviewed_at ?? null,
      reviewer_username: row.reviewer_username ?? null,
      reviewer_full_name: row.reviewer_full_name ?? null,
      valid_on: row.valid_on ?? null,
      pabrik_code: row.pabrik_code ?? null,
      kode_barang: row.kode_barang ?? null,
      delivery_officer_name: row.delivery_officer_name ?? null,
      delivery_employee_code: row.delivery_employee_code ?? null,
      nomor_surat_jalan: row.nomor_surat_jalan ?? null,
    };
  }

  async notifyAdminIncorrectDeliveryRecap({ reviewer, entry, reviewRow, notes }) {
    if (!this.notificationRepository || !entry || !reviewRow) return;
    const fieldOfficer = entry.employee_id
      ? await this.employeeRepository.findById(entry.employee_id)
      : null;
    const reviewerName = reviewer?.full_name || reviewer?.username || 'Staff Kantor';
    const officerLabel = fieldOfficer
      ? `${fieldOfficer.full_name} (${fieldOfficer.employee_id})`
      : `delivery #${entry.id}`;
    const date =
      entry.valid_on != null ? String(entry.valid_on).slice(0, 10) : '—';
    const pabrik = entry.pabrik_code || '—';
    const noteText = notes ? String(notes).trim().slice(0, 280) : '';
    await this.notificationRepository.insertAdminAlert({
      type: 'delivery_recap_review',
      title: 'Delivery recap flagged incorrect',
      body: `${reviewerName} marked a delivery line as not correct — ${officerLabel}, ${date}, pabrik ${pabrik}.${noteText ? ` Note: ${noteText}` : ''}`,
      payload: {
        reviewId: reviewRow.id,
        deliveryEntryId: entry.id,
        employeeId: entry.employee_id ?? null,
      },
    });
  }

  async saveDeliveryRecapReview(auth, { delivery_entry_id: deliveryEntryId, is_correct: isCorrect, notes }) {
    if (!isStaffKantor(auth.role)) {
      throw new AppError('Only Staff Kantor can save delivery recap reviews.', 403, 'FORBIDDEN');
    }
    if (!this.deliveryRecapReviewRepository || !this.fieldDeliveryRepository) {
      throw new AppError('Delivery recap reviews are not available.', 500, 'INTERNAL');
    }
    const entryId = Number(deliveryEntryId);
    if (!Number.isFinite(entryId) || entryId < 1) {
      throw new AppError('delivery_entry_id is required.', 400, 'DELIVERY_ID');
    }
    const entry = await this.fieldDeliveryRepository.findById(entryId);
    if (!entry) {
      throw new AppError('Delivery entry not found.', 404, 'NOT_FOUND');
    }
    if (typeof isCorrect !== 'boolean') {
      throw new AppError('Mark the delivery recap as correct or not correct.', 400, 'REVIEW_VERDICT');
    }
    const noteText = notes != null ? String(notes).trim() : '';
    if (!isCorrect && !noteText) {
      throw new AppError('Add a note when the recap is not correct.', 400, 'REVIEW_NOTES');
    }
    await this.deliveryRecapReviewRepository.create({
      deliveryEntryId: entryId,
      isCorrect,
      notes: noteText || null,
      reviewedBy: auth.userId,
    });
    const withUser = await this.deliveryRecapReviewRepository.findLatestForDelivery(entryId);
    if (!isCorrect && withUser) {
      const reviewer = await this.userRepository.findById(auth.userId);
      await this.notifyAdminIncorrectDeliveryRecap({
        reviewer,
        entry,
        reviewRow: withUser,
        notes: noteText,
      }).catch(() => {});
    }
    return this.formatDeliveryRecapReview(withUser);
  }
}

module.exports = { EmployeePortalService };
