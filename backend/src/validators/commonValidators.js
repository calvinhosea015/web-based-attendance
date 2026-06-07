const { body, param, query } = require('express-validator');
const { assertPasswordPolicy } = require('../utils/passwordPolicy');
const {
  VALID_ROLES,
  isAttendanceRole,
  isHeadOfFinance,
  usesMultipleOffices,
} = require('../constants/roles');
const { FIELD_OFFICER_CHECKOUT_MAX_LENGTH } = require('../constants/fieldOfficer');
const { validateFieldCheckoutCode } = require('../utils/fieldCheckoutPayload');

function fieldCheckoutCodeBodyValidator(field) {
  return body(field)
    .optional()
    .trim()
    .isString()
    .isLength({ max: FIELD_OFFICER_CHECKOUT_MAX_LENGTH })
    .custom((value) => {
      if (value === '' || value == null) return true;
      try {
        validateFieldCheckoutCode(value);
        return true;
      } catch (e) {
        throw new Error(e.message);
      }
    });
}

const loginValidators = [
  body('username').trim().notEmpty().withMessage('username required'),
  body('password').notEmpty().withMessage('password required'),
];

const optionalDateBody = (field) =>
  body(field)
    .optional({ values: 'null' })
    .custom((value) => {
      if (value === '' || value == null) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
        throw new Error(`${field} must be YYYY-MM-DD`);
      }
      return true;
    });

const refreshValidators = [body('refreshToken').trim().notEmpty().withMessage('refreshToken required')];

const logoutValidators = [body('refreshToken').optional().isString()];

const clockValidators = [
  body('lat').isFloat({ min: -90, max: 90 }).withMessage('lat invalid'),
  body('lng').isFloat({ min: -180, max: 180 }).withMessage('lng invalid'),
  body('accuracy_m').isFloat({ gt: 0 }).withMessage('accuracy_m required'),
  body('client_ts_ms')
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .withMessage('client_ts_ms invalid'),
];

const checkInValidators = [
  ...clockValidators,
  body('remote_work').optional().isBoolean({ strict: true }),
];

const checkOutValidators = [...clockValidators, fieldCheckoutCodeBodyValidator('checkout_code')];

const fieldCodeSubmitValidators = [
  body('code').optional().isString().isLength({ max: FIELD_OFFICER_CHECKOUT_MAX_LENGTH }),
  body('codes').optional().isArray({ max: 50 }),
  body('codes.*').optional().isString().isLength({ max: FIELD_OFFICER_CHECKOUT_MAX_LENGTH }),
  body().custom((_, { req }) => {
    const hasCode = req.body?.code != null && String(req.body.code).trim() !== '';
    const hasCodes = Array.isArray(req.body?.codes) && req.body.codes.some((c) => String(c).trim());
    if (!hasCode && !hasCodes) {
      throw new Error('At least one delivery code is required.');
    }
    return true;
  }),
];

const pabrikItemRateBodyValidators = [
  body('pabrik_code').trim().notEmpty().isString().isLength({ max: 32 }),
  body('kode_barang').trim().notEmpty().isString().isLength({ max: 64 }),
  body('tonase_per_item').isFloat({ min: 0 }),
];

const pabrikItemRateIdValidator = [param('id').isInt({ min: 1 })];

const pabrikIdValidator = [param('id').isInt({ min: 1 })];

const pabrikCreateValidators = [
  body('pabrik_code').trim().notEmpty().isString().isLength({ max: 32 }),
  body('nama_pabrik').trim().notEmpty().isString().isLength({ max: 255 }),
  body('google_maps_url').optional({ nullable: true }).trim().isLength({ max: 2000 }),
];

const pabrikUpdateValidators = [
  param('id').isInt({ min: 1 }),
  body('nama_pabrik').optional().trim().notEmpty().isString().isLength({ max: 255 }),
  body('google_maps_url').optional({ nullable: true }).trim().isLength({ max: 2000 }),
];

function passwordPolicyValidator() {
  return body('password').custom((value) => {
    try {
      assertPasswordPolicy(value);
      return true;
    } catch (e) {
      throw new Error(e.message);
    }
  });
}

const createUserValidators = [
  body('username').trim().notEmpty(),
  passwordPolicyValidator(),
  body('role').isIn(VALID_ROLES),
  body('office_ids').optional().isArray({ min: 1, max: 32 }),
  body('office_ids.*').optional().isInt({ min: 1 }),
  body('office_id')
    .optional({ nullable: true })
    .custom((value, { req }) => {
      if (usesMultipleOffices(req.body.role)) {
        const ids = Array.isArray(req.body.office_ids)
          ? req.body.office_ids.map((v) => Number(v)).filter((n) => n >= 1)
          : [];
        if (ids.length < 1) {
          const n = Number(value);
          if (!Number.isFinite(n) || n < 1) {
            throw new Error('office_ids (at least one location) is required for field officers');
          }
        }
      } else if (isAttendanceRole(req.body.role)) {
        if (value === undefined || value === null || value === '') {
          throw new Error('office_id is required for employees');
        }
        const n = Number(value);
        if (!Number.isFinite(n) || n < 1) throw new Error('Invalid office_id');
      } else if (isHeadOfFinance(req.body.role)) {
        if (value != null && value !== '') {
          const n = Number(value);
          if (!Number.isFinite(n) || n < 1) throw new Error('Invalid office_id');
        }
      } else if (value != null && value !== '') {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 1) throw new Error('Invalid office_id');
      }
      return true;
    }),
  body('employee_id').optional({ values: 'null' }).isString(),
  body('full_name').optional({ values: 'null' }).isString(),
  body('remote_work_allowed').optional().isBoolean({ strict: true }),
  body('salary_type').optional({ values: 'null' }).isString(),
  body('basic_salary').optional({ values: 'null' }).isNumeric(),
  body('upah_harian').optional({ values: 'null' }).isNumeric(),
  optionalDateBody('join_date'),
  optionalDateBody('birthday'),
  body('custom_work_start').optional({ values: 'null' }).isString(),
  body('custom_work_end').optional({ values: 'null' }).isString(),
];

const changePasswordValidators = [passwordPolicyValidator()];

const updateUserValidators = [
  body('username').optional().trim().notEmpty(),
  body('role').optional().isIn(VALID_ROLES),
  body('office_id').optional({ values: 'null' }),
  body('office_ids').optional().isArray({ min: 1, max: 32 }),
  body('office_ids.*').optional().isInt({ min: 1 }),
  body('full_name').optional({ values: 'null' }).isString(),
  body('remote_work_allowed').optional().isBoolean({ strict: true }),
  optionalDateBody('join_date'),
  optionalDateBody('birthday'),
  body('custom_work_start').optional({ values: 'null' }).isString(),
  body('custom_work_end').optional({ values: 'null' }).isString(),
  body('basic_salary').optional({ values: 'null' }).isNumeric(),
];

const idParamValidator = [param('id').isInt({ min: 1 })];

const userAttendanceQueryValidators = [query('limit').optional().isInt({ min: 1, max: 500 })];

const officeCreateValidators = [
  body('name').trim().notEmpty(),
  body('locationLink').trim().notEmpty(),
];

const officeUpdateValidators = [...officeCreateValidators];

const departmentCreateValidators = [body('name').trim().notEmpty()];

const employeeUpdateValidators = [
  body('photo_url').optional().isString().isLength({ max: 2048 }),
  body('contract_status').optional().isString().isLength({ max: 64 }),
  body('department_id').optional().isInt({ min: 1 }),
  body('position_id').optional().isInt({ min: 1 }),
  body('remote_work_allowed').optional().isBoolean({ strict: true }),
  optionalDateBody('join_date'),
  optionalDateBody('birthday'),
  body('tunjangan_masa_kerja').optional().isFloat({ min: 0 }),
  body('transport_eligible').optional().isBoolean({ strict: true }),
];

const payrollSettingsValidators = [
  body('transport_amount').optional().isFloat({ min: 0 }),
  body('diligence_amount').optional().isFloat({ min: 0 }),
  body('default_upah_harian').optional().isFloat({ min: 0 }),
];

const payrollPeriodParamValidator = [param('period').matches(/^\d{4}-\d{2}$/)];
const payrollGenerateValidators = [body('required_work_days').optional().isInt({ min: 0, max: 31 })];

const payrollEntryValidators = [
  body('upah_harian').optional().isFloat({ min: 0 }),
  body('monthly_basic_gross').optional().isFloat({ min: 0 }),
  body('basic_salary').optional().isFloat({ min: 0 }),
  body('tunjangan_masa_kerja').optional().isFloat({ min: 0 }),
  body('transport_eligible').optional().isBoolean({ strict: true }),
  body('overtime_pay').optional().isFloat({ min: 0 }),
  body('insentif').optional().isFloat({ min: 0 }),
  body('diligence_eligible').optional().isBoolean({ strict: true }),
  body('bonus_omset').optional().isFloat({ min: 0 }),
  body('deductions').optional().isFloat({ min: 0 }),
  body('other_deductions').optional().isFloat({ min: 0 }),
  body('pph_21').optional().isFloat({ min: 0 }),
  body('late_deduction').optional().isFloat({ min: 0 }),
  body('loan_deduction').optional().isFloat({ min: 0 }),
  body('transport_allowance_amount').optional().isFloat({ min: 0 }),
  body('diligence_allowance_amount').optional().isFloat({ min: 0 }),
  body('keterangan').optional().isString().trim().isLength({ max: 500 }),
];

const payrollEmployeeDefaultsValidators = [
  body('tunjangan_masa_kerja').optional().isFloat({ min: 0 }),
  body('basic_salary').optional().isFloat({ min: 0 }),
  body('upah_harian').optional().isFloat({ min: 0 }),
  body('transport_eligible').optional().isBoolean({ strict: true }),
  body('transport_allowance_amount').optional().isFloat({ min: 0 }),
  body('diligence_allowance_amount').optional().isFloat({ min: 0 }),
];

const loanSubmitValidators = [
  body('loan_amount').isFloat({ gt: 0 }),
  body('monthly_deduction').isFloat({ gt: 0 }),
  body('notes').optional().trim().isLength({ max: 2000 }),
];

const loanDecideValidators = [
  body('status').isIn(['approved', 'rejected']),
  body('rejection_reason').optional().trim().isLength({ max: 500 }),
];

const fieldDeliveryQueryValidators = [
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('days').optional().isInt({ min: 1, max: 365 }),
];

const dateRangeQueryValidators = [
  query('from').matches(/^\d{4}-\d{2}-\d{2}$/),
  query('to').matches(/^\d{4}-\d{2}-\d{2}$/),
];

const leaveSettingsValidators = [
  body('medical_days_per_year').isFloat({ min: 0 }),
  body('unpaid_days_per_year').isFloat({ min: 0 }),
  body('paternity_days_per_year').isFloat({ min: 0 }),
];

const leaveSubmitValidators = [
  body('leave_type').isIn(['medical', 'unpaid', 'paternity']),
  body('start_date').matches(/^\d{4}-\d{2}-\d{2}$/),
  body('end_date').matches(/^\d{4}-\d{2}-\d{2}$/),
  body('reason').optional().trim().isLength({ max: 2000 }),
];

const leaveDecideValidators = [
  body('status').isIn(['approved', 'rejected']),
  body('rejection_reason').optional().trim().isLength({ max: 500 }),
  body('is_paid').optional().isBoolean(),
];

module.exports = {
  loginValidators,
  refreshValidators,
  logoutValidators,
  clockValidators,
  checkInValidators,
  checkOutValidators,
  fieldCodeSubmitValidators,
  pabrikItemRateBodyValidators,
  pabrikItemRateIdValidator,
  pabrikIdValidator,
  pabrikCreateValidators,
  pabrikUpdateValidators,
  createUserValidators,
  changePasswordValidators,
  updateUserValidators,
  idParamValidator,
  userAttendanceQueryValidators,
  officeCreateValidators,
  officeUpdateValidators,
  departmentCreateValidators,
  employeeUpdateValidators,
  payrollSettingsValidators,
  payrollPeriodParamValidator,
  payrollGenerateValidators,
  payrollEntryValidators,
  payrollEmployeeDefaultsValidators,
  loanSubmitValidators,
  loanDecideValidators,
  fieldDeliveryQueryValidators,
  dateRangeQueryValidators,
  leaveSettingsValidators,
  leaveSubmitValidators,
  leaveDecideValidators,
};
