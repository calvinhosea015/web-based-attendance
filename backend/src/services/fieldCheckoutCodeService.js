const { attendanceCalendarDayStr } = require('../utils/calendarDay');
const { AppError } = require('../utils/errors');
const { isFieldOfficer } = require('../constants/roles');
const {
  validateFieldCheckoutCode,
  normalizeCode,
} = require('../utils/fieldCheckoutPayload');

class FieldCheckoutCodeService {
  constructor(fieldCodeEntryRepository) {
    this.fieldCodeEntryRepository = fieldCodeEntryRepository;
  }

  async submit(auth, payload) {
    if (!isFieldOfficer(auth.role)) {
      throw new AppError('Only field officers can submit checkout data.', 403, 'NOT_FIELD_OFFICER');
    }
    if (!auth.employeeId) {
      throw new AppError('Account is not linked to an employee profile.', 400, 'NO_EMPLOYEE');
    }

    validateFieldCheckoutCode(payload?.code);

    const validOn = attendanceCalendarDayStr();
    const existing = await this.fieldCodeEntryRepository.findForEmployeeOnDate(auth.employeeId, validOn);
    if (existing) {
      throw new AppError('Checkout data already recorded for today.', 409, 'FIELD_CODE_ALREADY');
    }

    await this.fieldCodeEntryRepository.createForEmployeeOnDate(auth.employeeId, validOn);
    return {
      message: 'Checkout data accepted for today.',
      code: 'FIELD_CODE_ACCEPTED',
    };
  }

  async assertReadyForCheckout(auth, checkoutCodeRaw) {
    if (!isFieldOfficer(auth.role) || !auth.employeeId) return;

    validateFieldCheckoutCode(checkoutCodeRaw);

    const validOn = attendanceCalendarDayStr();
    let entry = await this.fieldCodeEntryRepository.findForEmployeeOnDate(auth.employeeId, validOn);
    if (!entry) {
      await this.fieldCodeEntryRepository.createForEmployeeOnDate(auth.employeeId, validOn);
      entry = await this.fieldCodeEntryRepository.findForEmployeeOnDate(auth.employeeId, validOn);
    }
    if (!entry) {
      throw new AppError(
        'Enter checkout data (9 fields separated by *) before you can check out.',
        400,
        'FIELD_CODE_REQUIRED'
      );
    }
  }

  async linkCheckout(auth, attendanceId) {
    if (!isFieldOfficer(auth.role) || !auth.employeeId || !attendanceId) return;
    const validOn = attendanceCalendarDayStr();
    await this.fieldCodeEntryRepository.linkAttendance(auth.employeeId, validOn, attendanceId);
  }
}

module.exports = { FieldCheckoutCodeService, normalizeCode };
