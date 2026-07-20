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
  usesDailyWagePayroll,
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
    employeePabrikRepository = null
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
    const onceDailyInOut = usesOncePerDayInOut(auth.role);

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
    } else if (umum) {
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
    if (onceDailyInOut || umum) {
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
      daily_wage_mode: usesDailyWagePayroll(auth.role),
      umum_mode: umum,
      accounting_mode: accounting,
      once_daily_in_out_mode: onceDailyInOut,
      daily_segments: onceDailyInOut || umum ? null : CLOCK_SEGMENTS_PER_DAY,
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

  async listFieldOfficerDeliveries(auth, { limit = 100, days = 60 } = {}) {
    if (!isStaffKantor(auth.role)) {
      throw new AppError('Only Staff Kantor can view field delivery data.', 403, 'FORBIDDEN');
    }
    const userRow = await this.userRepository.findById(auth.userId);
    if (!userRow?.office_id) {
      throw new AppError(
        'No office is assigned to your account. Ask an admin to assign an office.',
        400,
        'NO_OFFICE'
      );
    }
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
    const safeDays = Math.min(365, Math.max(1, Number(days) || 60));
    const rows = this.fieldDeliveryRepository
      ? await this.fieldDeliveryRepository.listByOffice(userRow.office_id, {
          limit: safeLimit,
          days: safeDays,
        })
      : await this.attendanceRepository.listFieldOfficerDeliveriesByOffice(userRow.office_id, {
          limit: safeLimit,
          days: safeDays,
        });
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
    }));
  }
}

module.exports = { EmployeePortalService };
