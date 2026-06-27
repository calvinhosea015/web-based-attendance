const { attendanceCalendarDayStr } = require('../utils/calendarDay');
const { AppError } = require('../utils/errors');
const { isFieldOfficer } = require('../constants/roles');
const {
  validateFieldCheckoutCode,
  normalizeCode,
  normalizeFieldCheckoutCodes,
} = require('../utils/fieldCheckoutPayload');
const { computeLineBonus, computeLineOmset } = require('../utils/fieldOfficerBonus');

class FieldCheckoutCodeService {
  constructor(
    fieldDeliveryRepository,
    pabrikItemRateRepository,
    fieldCodeEntryRepository = null,
    employeePabrikRepository = null,
    attendanceRepository = null
  ) {
    this.fieldDeliveryRepository = fieldDeliveryRepository;
    this.pabrikItemRateRepository = pabrikItemRateRepository;
    this.fieldCodeEntryRepository = fieldCodeEntryRepository;
    this.employeePabrikRepository = employeePabrikRepository;
    this.attendanceRepository = attendanceRepository;
  }

  async assertCheckedInToday(employeeId, validOn) {
    if (!this.attendanceRepository) return;
    const count = await this.attendanceRepository.countTodaySegments(employeeId, validOn);
    if (count < 1) {
      throw new AppError('Check in before submitting delivery data.', 400, 'CHECK_IN_REQUIRED');
    }
  }

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

  async resolveLineBonus(parsed) {
    const rate = await this.pabrikItemRateRepository.findByPabrikAndBarang(
      parsed.pabrik_code,
      parsed.kode_barang
    );
    if (!rate) {
      throw new AppError(
        `No tonase rate for pabrik "${parsed.pabrik_code}" and item "${parsed.kode_barang}". Ask admin to configure pabrik item rates.`,
        400,
        'PABRIK_ITEM_NOT_FOUND'
      );
    }
    const tonase = Number(rate.tonase_per_item) || 0;
    const price_per_item = Number(rate.price_per_item) || 0;
    if (tonase <= 0 && price_per_item <= 0) {
      throw new AppError(
        `No tonase or price for pabrik "${parsed.pabrik_code}" and item "${parsed.kode_barang}". Ask admin to configure rates.`,
        400,
        'PABRIK_ITEM_NOT_FOUND'
      );
    }
    const omset_amount = computeLineOmset(tonase, parsed.berat_bersih, price_per_item);
    const bonus_amount = computeLineBonus(tonase, parsed.berat_bersih, price_per_item);
    return { tonase_per_item: tonase, price_per_item, omset_amount, bonus_amount, rate };
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
    await this.assertCheckedInToday(auth.employeeId, validOn);
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

    // Money stays server-authoritative: re-resolve the catalog rate for the (possibly
    // changed) pabrik+item, falling back to the rate already stored on the line.
    let tonase_per_item = Number(existing.tonase_per_item) || 0;
    let price_per_item = Number(existing.price_per_item) || 0;
    const rate = await this.pabrikItemRateRepository.findByPabrikAndBarang(
      pabrik_code,
      kode_barang
    );
    if (rate) {
      tonase_per_item = Number(rate.tonase_per_item) || 0;
      price_per_item = Number(rate.price_per_item) || 0;
    }

    const selisih = Math.abs(kotor - berat_bersih);
    const omset_amount = computeLineOmset(tonase_per_item, berat_bersih, price_per_item);
    const bonus_amount = computeLineBonus(tonase_per_item, berat_bersih, price_per_item);

    const entry = await this.fieldDeliveryRepository.updateEntry(id, {
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
      tonase_per_item,
      price_per_item,
      omset_amount,
      bonus_amount,
    });
    return { message: 'Delivery entry updated.', code: 'DELIVERY_UPDATED', entry };
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
