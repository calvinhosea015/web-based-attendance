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
  constructor(fieldDeliveryRepository, pabrikItemRateRepository, fieldCodeEntryRepository = null) {
    this.fieldDeliveryRepository = fieldDeliveryRepository;
    this.pabrikItemRateRepository = pabrikItemRateRepository;
    this.fieldCodeEntryRepository = fieldCodeEntryRepository;
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
    const omset_amount = computeLineOmset(tonase, parsed.selisih);
    const bonus_amount = computeLineBonus(tonase, parsed.selisih);
    return { tonase_per_item: tonase, omset_amount, bonus_amount, rate };
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
    const entries = [];

    for (const rawCode of codes) {
      const parsed = validateFieldCheckoutCode(rawCode);
      const { tonase_per_item, omset_amount, bonus_amount } = await this.resolveLineBonus(parsed);
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
        omset_amount,
        bonus_amount,
        attendance_id: null,
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

  async assertReadyForCheckout(auth, checkoutCodeRaw) {
    if (!isFieldOfficer(auth.role) || !auth.employeeId) return;

    const validOn = attendanceCalendarDayStr();
    const count = await this.fieldDeliveryRepository.countForEmployeeOnDate(
      auth.employeeId,
      validOn
    );

    if (checkoutCodeRaw) {
      const parsed = validateFieldCheckoutCode(checkoutCodeRaw);
      const { tonase_per_item, omset_amount, bonus_amount } = await this.resolveLineBonus(parsed);
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
        omset_amount,
        bonus_amount,
        attendance_id: null,
      });
    } else if (count < 1) {
      throw new AppError(
        'Enter at least one delivery code (9 fields separated by *) before you can check out.',
        400,
        'FIELD_CODE_REQUIRED'
      );
    }
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
