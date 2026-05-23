const config = require('../config/env');
const { AppError } = require('../utils/errors');
const { isFieldOfficer } = require('../constants/roles');
const {
  FIELD_OFFICER_CHECKOUT_MIN_LENGTH,
  FIELD_OFFICER_CHECKOUT_MAX_LENGTH,
} = require('../constants/fieldOfficer');

function normalizeCode(raw) {
  return raw != null ? String(raw).trim() : '';
}

function expectedKeyword() {
  return config.fieldOfficerCheckoutKeyword;
}

function codesMatch(provided, expected) {
  return normalizeCode(provided).toLowerCase() === normalizeCode(expected).toLowerCase();
}

function assertKeywordConfigured() {
  const keyword = expectedKeyword();
  if (!keyword) {
    throw new AppError(
      'Checkout keyword is not configured. Contact IT or admin.',
      503,
      'FIELD_KEYWORD_NOT_CONFIGURED'
    );
  }
  return keyword;
}

function validateCodeLength(code) {
  if (code.length < FIELD_OFFICER_CHECKOUT_MIN_LENGTH) {
    throw new AppError(
      `Checkout phrase must be at least ${FIELD_OFFICER_CHECKOUT_MIN_LENGTH} characters.`,
      400,
      'CHECKOUT_CODE_TOO_SHORT'
    );
  }
  if (code.length > FIELD_OFFICER_CHECKOUT_MAX_LENGTH) {
    throw new AppError('Checkout phrase is too long.', 400, 'CHECKOUT_CODE_TOO_LONG');
  }
}

class FieldCheckoutCodeService {
  constructor(fieldCodeEntryRepository) {
    this.fieldCodeEntryRepository = fieldCodeEntryRepository;
  }

  async submit(auth, payload) {
    if (!isFieldOfficer(auth.role)) {
      throw new AppError('Only field officers can submit the checkout keyword.', 403, 'NOT_FIELD_OFFICER');
    }
    if (!auth.employeeId) {
      throw new AppError('Account is not linked to an employee profile.', 400, 'NO_EMPLOYEE');
    }

    const keyword = assertKeywordConfigured();
    const code = normalizeCode(payload?.code);
    validateCodeLength(code);
    if (!codesMatch(code, keyword)) {
      throw new AppError('Invalid checkout keyword.', 400, 'INVALID_CHECKOUT_CODE');
    }

    const validOn = new Date().toISOString().slice(0, 10);
    const existing = await this.fieldCodeEntryRepository.findForEmployeeOnDate(auth.employeeId, validOn);
    if (existing) {
      throw new AppError('Checkout keyword already recorded for today.', 409, 'FIELD_CODE_ALREADY');
    }

    await this.fieldCodeEntryRepository.createForEmployeeOnDate(auth.employeeId, validOn);
    return {
      message: 'Checkout keyword accepted for today.',
      code: 'FIELD_CODE_ACCEPTED',
    };
  }

  async assertReadyForCheckout(auth, checkoutCodeRaw) {
    if (!isFieldOfficer(auth.role) || !auth.employeeId) return;

    const keyword = assertKeywordConfigured();
    const code = normalizeCode(checkoutCodeRaw);
    if (!code) {
      throw new AppError('Checkout code is required to check out.', 400, 'CHECKOUT_CODE_REQUIRED');
    }
    validateCodeLength(code);
    if (!codesMatch(code, keyword)) {
      throw new AppError('Invalid checkout keyword.', 400, 'INVALID_CHECKOUT_CODE');
    }

    const validOn = new Date().toISOString().slice(0, 10);
    const entry = await this.fieldCodeEntryRepository.findForEmployeeOnDate(auth.employeeId, validOn);
    if (!entry) {
      throw new AppError(
        `Enter the checkout phrase (at least ${FIELD_OFFICER_CHECKOUT_MIN_LENGTH} characters) before you can check out.`,
        400,
        'FIELD_CODE_REQUIRED'
      );
    }
  }

  async linkCheckout(auth, attendanceId) {
    if (!isFieldOfficer(auth.role) || !auth.employeeId || !attendanceId) return;
    const validOn = new Date().toISOString().slice(0, 10);
    await this.fieldCodeEntryRepository.linkAttendance(auth.employeeId, validOn, attendanceId);
  }
}

module.exports = { FieldCheckoutCodeService };
