const { attendanceCalendarDayStr } = require('../utils/calendarDay');
const { AppError } = require('../utils/errors');
const { isFieldOfficer } = require('../constants/roles');
const {
  validateFieldCheckoutCode,
  normalizeCode,
  normalizeFieldCheckoutCodes,
} = require('../utils/fieldCheckoutPayload');
const { computeLineBonus, computeLineOmset, FIELD_OFFICER_BONUS_RATE } = require('../utils/fieldOfficerBonus');
const { payrollCycleBounds } = require('../utils/payrollPeriod');
const { formatRecapReview } = require('../repositories/deliveryRecapReviewRepository');

class FieldCheckoutCodeService {
  constructor(
    fieldDeliveryRepository,
    pabrikItemRateRepository,
    fieldCodeEntryRepository = null,
    employeePabrikRepository = null,
    attendanceRepository = null,
    pabrikRepository = null,
    deliveryRecapReviewRepository = null,
    notificationRepository = null
  ) {
    this.fieldDeliveryRepository = fieldDeliveryRepository;
    this.pabrikItemRateRepository = pabrikItemRateRepository;
    this.fieldCodeEntryRepository = fieldCodeEntryRepository;
    this.employeePabrikRepository = employeePabrikRepository;
    this.attendanceRepository = attendanceRepository;
    this.pabrikRepository = pabrikRepository;
    this.deliveryRecapReviewRepository = deliveryRecapReviewRepository;
    this.notificationRepository = notificationRepository;
  }

  /** Link to today's attendance when present (open or already checked out). */
  async todayAttendanceId(employeeId, validOn) {
    if (!this.attendanceRepository) return null;
    const open = await this.attendanceRepository.findOpenToday(employeeId, validOn);
    if (open) return open.id;
    const any = await this.attendanceRepository.findAnyToday(employeeId, validOn);
    return any?.id ?? null;
  }

  async assertPabrikAssigned(employeeId, pabrikCode) {
    if (!employeeId || !this.employeePabrikRepository) return;
    const assigned = await this.employeePabrikRepository.listPabrikCodesByEmployee(employeeId);
    if (!assigned.length) {
      throw new AppError(
        'No factories are assigned to your account. Contact admin to assign factories.',
        403,
        'PABRIK_REQUIRED'
      );
    }
    const code = String(pabrikCode).trim();
    const allowed = assigned.some((c) => c.localeCompare(code, undefined, { sensitivity: 'accent' }) === 0);
    if (!allowed) {
      throw new AppError(
        `Factory "${pabrikCode}" is not assigned to your account. Contact admin to update your factory assignments.`,
        403,
        'PABRIK_NOT_ASSIGNED'
      );
    }
  }

  async resolveBonusOmsetRate(pabrikCode) {
    if (!this.pabrikRepository || !pabrikCode) return FIELD_OFFICER_BONUS_RATE;
    const pabrik = await this.pabrikRepository.findByCode(pabrikCode);
    const rate = Number(pabrik?.bonus_omset_rate);
    return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : FIELD_OFFICER_BONUS_RATE;
  }

  async resolveLineBonus(parsed) {
    const rate = await this.pabrikItemRateRepository.findByPabrikAndBarang(
      parsed.pabrik_code,
      parsed.kode_barang
    );
    if (!rate) {
      throw new AppError(
        `No price rate for pabrik "${parsed.pabrik_code}" and item "${parsed.kode_barang}". Ask admin to configure pabrik item rates.`,
        400,
        'PABRIK_ITEM_NOT_FOUND'
      );
    }
    const price_per_item = Number(rate.price_per_item) || 0;
    if (price_per_item <= 0) {
      throw new AppError(
        `No price for pabrik "${parsed.pabrik_code}" and item "${parsed.kode_barang}". Ask admin to configure rates.`,
        400,
        'PABRIK_ITEM_NOT_FOUND'
      );
    }
    const bonus_omset_rate = await this.resolveBonusOmsetRate(parsed.pabrik_code);
    const omset_amount = computeLineOmset(0, parsed.berat_bersih, price_per_item);
    const bonus_amount = computeLineBonus(
      0,
      parsed.berat_bersih,
      price_per_item,
      bonus_omset_rate
    );
    return { tonase_per_item: 0, price_per_item, omset_amount, bonus_amount, rate };
  }

  async submit(auth, payload) {
    if (!isFieldOfficer(auth.role)) {
      throw new AppError('Only field officers can submit checkout data.', 403, 'NOT_FIELD_OFFICER');
    }
    if (!auth.employeeId) {
      throw new AppError('Account is not linked to an employee profile.', 400, 'NO_EMPLOYEE');
    }

    const codes = normalizeFieldCheckoutCodes(payload);
    if (!codes.length) {
      throw new AppError('At least one delivery code is required.', 400, 'CHECKOUT_CODE_REQUIRED');
    }

    const validOn = attendanceCalendarDayStr();
    // Delivery data is independent of clock state: allowed before check-in,
    // while on duty, and after check-out (next_clock_action === 'done').
    const attendanceId = await this.todayAttendanceId(auth.employeeId, validOn);
    const entries = [];

    for (const rawCode of codes) {
      const parsed = validateFieldCheckoutCode(rawCode);
      await this.assertPabrikAssigned(auth.employeeId, parsed.pabrik_code);
      const { tonase_per_item, price_per_item, omset_amount, bonus_amount } =
        await this.resolveLineBonus(parsed);
      const saved = await this.fieldDeliveryRepository.createEntry({
        employee_id: auth.employeeId,
        valid_on: validOn,
        checkout_code: parsed.raw,
        pabrik_code: parsed.pabrik_code,
        norek: parsed.norek,
        nomor_tanda_terima: parsed.nomor_tanda_terima,
        nomor_surat_jalan: parsed.nomor_surat_jalan,
        nopol: parsed.nopol,
        no_bs: parsed.no_bs,
        kode_barang: parsed.kode_barang,
        kotor: parsed.kotor,
        berat_bersih: parsed.berat_bersih,
        selisih: parsed.selisih,
        tonase_per_item,
        price_per_item,
        omset_amount,
        bonus_amount,
        attendance_id: attendanceId,
      });
      entries.push(saved);
    }

    if (this.fieldCodeEntryRepository) {
      const existing = await this.fieldCodeEntryRepository.findForEmployeeOnDate(
        auth.employeeId,
        validOn
      );
      if (!existing) {
        await this.fieldCodeEntryRepository.createForEmployeeOnDate(auth.employeeId, validOn);
      }
    }

    const today_bonus_total = await this.fieldDeliveryRepository.sumBonusForEmployeeOnDate(
      auth.employeeId,
      validOn
    );
    const today_omset_total = await this.fieldDeliveryRepository.sumOmsetForEmployeeOnDate(
      auth.employeeId,
      validOn
    );

    return {
      message: entries.length > 1 ? 'Delivery codes accepted.' : 'Delivery code accepted.',
      code: 'FIELD_CODE_ACCEPTED',
      entries,
      today_bonus_total,
      today_omset_total,
      count: entries.length,
    };
  }

  async updateDeliveryAsAdmin(auth, id, payload) {
    if (auth.role !== 'admin') {
      throw new AppError('Only admins can edit delivery entries.', 403, 'NOT_ADMIN');
    }
    const existing = await this.fieldDeliveryRepository.findById(id);
    if (!existing) {
      throw new AppError('Delivery entry not found.', 404, 'DELIVERY_NOT_FOUND');
    }

    const str = (v, fallback) => (v === undefined || v === null ? fallback : String(v).trim());
    const numOr = (v, fallback) => {
      if (v === undefined || v === null || v === '') return fallback;
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };

    const pabrik_code = str(payload.pabrik_code, existing.pabrik_code);
    const kode_barang = str(payload.kode_barang, existing.kode_barang);
    const norek = str(payload.norek, existing.norek);
    const nomor_tanda_terima = str(payload.nomor_tanda_terima, existing.nomor_tanda_terima);
    const nomor_surat_jalan = str(payload.nomor_surat_jalan, existing.nomor_surat_jalan);
    const nopol = str(payload.nopol, existing.nopol);
    const no_bs = str(payload.no_bs, existing.no_bs);
    const kotor = numOr(payload.kotor, Number(existing.kotor) || 0);
    const berat_bersih = numOr(payload.berat_bersih, Number(existing.berat_bersih) || 0);

    const currentValidOn =
      existing.valid_on != null ? String(existing.valid_on).slice(0, 10) : '';
    let valid_on = currentValidOn;
    if (payload.valid_on != null && String(payload.valid_on).trim() !== '') {
      valid_on = String(payload.valid_on).trim().slice(0, 10);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valid_on)) {
      throw new AppError('valid_on must be YYYY-MM-DD.', 400, 'INVALID_VALID_ON');
    }
    const dateChanged = valid_on !== currentValidOn;
    let attendance_id = existing.attendance_id ?? null;
    if (dateChanged) {
      attendance_id = await this.todayAttendanceId(existing.employee_id, valid_on);
    }

    // Money stays server-authoritative: re-resolve the catalog rate for the (possibly
    // changed) pabrik+item, falling back to the rate already stored on the line.
    let price_per_item = Number(existing.price_per_item) || 0;
    const rate = await this.pabrikItemRateRepository.findByPabrikAndBarang(
      pabrik_code,
      kode_barang
    );
    if (rate) {
      price_per_item = Number(rate.price_per_item) || 0;
    }

    const selisih = Math.abs(kotor - berat_bersih);
    const bonus_omset_rate = await this.resolveBonusOmsetRate(pabrik_code);
    const omset_amount = computeLineOmset(0, berat_bersih, price_per_item);
    const bonus_amount = computeLineBonus(0, berat_bersih, price_per_item, bonus_omset_rate);

    const entry = await this.fieldDeliveryRepository.updateEntry(id, {
      valid_on,
      attendance_id,
      pabrik_code,
      norek,
      nomor_tanda_terima,
      nomor_surat_jalan,
      nopol,
      no_bs,
      kode_barang,
      kotor,
      berat_bersih,
      selisih,
      tonase_per_item: 0,
      price_per_item,
      omset_amount,
      bonus_amount,
    });

    if (dateChanged && this.fieldCodeEntryRepository && existing.employee_id) {
      const existingCode = await this.fieldCodeEntryRepository.findForEmployeeOnDate(
        existing.employee_id,
        valid_on
      );
      if (!existingCode) {
        await this.fieldCodeEntryRepository.createForEmployeeOnDate(
          existing.employee_id,
          valid_on
        );
      }
      if (attendance_id) {
        await this.fieldCodeEntryRepository.linkAttendance(
          existing.employee_id,
          valid_on,
          attendance_id
        );
      }
    }

    // ponytail: only resolves flagged rows; upgrade path = explicit admin resolve endpoint
    let recapReview = null;
    if (this.deliveryRecapReviewRepository && auth.userId) {
      const latest = await this.deliveryRecapReviewRepository.findLatestForDelivery(id);
      if (latest?.is_correct === false) {
        await this.deliveryRecapReviewRepository.create({
          deliveryEntryId: id,
          isCorrect: true,
          notes: null,
          reviewedBy: auth.userId,
        });
        recapReview = await this.deliveryRecapReviewRepository.findLatestForDelivery(id);
        if (this.notificationRepository) {
          await this.notificationRepository.markAdminDeliveryRecapRead(id).catch(() => {});
        }
      }
    }

    return {
      message: 'Delivery entry updated.',
      code: 'DELIVERY_UPDATED',
      entry,
      recap_review: formatRecapReview(recapReview),
    };
  }

  async deleteDeliveryAsAdmin(auth, id) {
    if (auth.role !== 'admin') {
      throw new AppError('Only admins can delete delivery entries.', 403, 'NOT_ADMIN');
    }
    const deleted = await this.fieldDeliveryRepository.deleteEntry(id);
    if (!deleted) {
      throw new AppError('Delivery entry not found.', 404, 'DELIVERY_NOT_FOUND');
    }
    return { message: 'Delivery entry deleted.', code: 'DELIVERY_DELETED', id: deleted.id };
  }

  async listMyDeliveriesToday(auth) {
    if (!isFieldOfficer(auth.role) || !auth.employeeId) {
      throw new AppError('Only field officers can view delivery entries.', 403, 'NOT_FIELD_OFFICER');
    }
    const validOn = attendanceCalendarDayStr();
    const entries = await this.fieldDeliveryRepository.listForEmployeeOnDate(
      auth.employeeId,
      validOn
    );
    const today_bonus_total = await this.fieldDeliveryRepository.sumBonusForEmployeeOnDate(
      auth.employeeId,
      validOn
    );
    const today_omset_total = await this.fieldDeliveryRepository.sumOmsetForEmployeeOnDate(
      auth.employeeId,
      validOn
    );
    return { valid_on: validOn, entries, today_bonus_total, today_omset_total };
  }

  /** Own delivery lines + totals for a payroll cycle (25th prev → 24th named month). */
  async listMyDeliveriesForPeriod(auth, period) {
    if (!isFieldOfficer(auth.role) || !auth.employeeId) {
      throw new AppError('Only field officers can view delivery entries.', 403, 'NOT_FIELD_OFFICER');
    }
    const bounds = payrollCycleBounds(period);
    if (!bounds) {
      throw new AppError('Invalid payroll period. Use YYYY-MM.', 400, 'PAYROLL_PERIOD');
    }
    const { period_start, period_end, payroll_period } = bounds;
    const [entries, bonus_total, omset_total] = await Promise.all([
      this.fieldDeliveryRepository.listForEmployeeBetween(
        auth.employeeId,
        period_start,
        period_end
      ),
      this.fieldDeliveryRepository.sumBonusBetween(auth.employeeId, period_start, period_end),
      this.fieldDeliveryRepository.sumOmsetBetween(auth.employeeId, period_start, period_end),
    ]);
    return {
      payroll_period,
      period_start,
      period_end,
      entries,
      delivery_count: entries.length,
      bonus_total,
      omset_total,
    };
  }

  // Field officers may check out without any delivery data. A checkout code is only
  // recorded as a delivery when one is actually supplied (kept for backward compatibility).
  async assertReadyForCheckout(auth, checkoutCodeRaw) {
    if (!isFieldOfficer(auth.role) || !auth.employeeId || !checkoutCodeRaw) return;

    const validOn = attendanceCalendarDayStr();
    const parsed = validateFieldCheckoutCode(checkoutCodeRaw);
    await this.assertPabrikAssigned(auth.employeeId, parsed.pabrik_code);
    const { tonase_per_item, price_per_item, omset_amount, bonus_amount } =
      await this.resolveLineBonus(parsed);
    await this.fieldDeliveryRepository.createEntry({
      employee_id: auth.employeeId,
      valid_on: validOn,
      checkout_code: parsed.raw,
      pabrik_code: parsed.pabrik_code,
      norek: parsed.norek,
      nomor_tanda_terima: parsed.nomor_tanda_terima,
      nomor_surat_jalan: parsed.nomor_surat_jalan,
      nopol: parsed.nopol,
      no_bs: parsed.no_bs,
      kode_barang: parsed.kode_barang,
      kotor: parsed.kotor,
      berat_bersih: parsed.berat_bersih,
      selisih: parsed.selisih,
      tonase_per_item,
      price_per_item,
      omset_amount,
      bonus_amount,
      attendance_id: null,
    });
  }

  async linkCheckout(auth, attendanceId) {
    if (!isFieldOfficer(auth.role) || !auth.employeeId || !attendanceId) return;
    const validOn = attendanceCalendarDayStr();
    await this.fieldDeliveryRepository.linkAttendanceForDate(
      auth.employeeId,
      validOn,
      attendanceId
    );
    if (this.fieldCodeEntryRepository) {
      await this.fieldCodeEntryRepository.linkAttendance(auth.employeeId, validOn, attendanceId);
    }
  }
}

module.exports = { FieldCheckoutCodeService, normalizeCode };
