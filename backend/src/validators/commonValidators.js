const { body, param, query } = require('express-validator');
const { assertPasswordPolicy } = require('../utils/passwordPolicy');

const loginValidators = [
  body('username').trim().notEmpty().withMessage('username required'),
  body('password').notEmpty().withMessage('password required'),
];

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

const checkOutValidators = [...clockValidators];

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
  body('role').isIn(['admin', 'employee']),
  body('office_id')
    .optional({ nullable: true })
    .custom((value, { req }) => {
      if (req.body.role === 'employee') {
        if (value === undefined || value === null || value === '') {
          throw new Error('office_id is required for employees');
        }
        const n = Number(value);
        if (!Number.isFinite(n) || n < 1) throw new Error('Invalid office_id');
      } else if (value != null && value !== '') {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 1) throw new Error('Invalid office_id');
      }
      return true;
    }),
  body('employee_id').optional({ values: 'null' }).isString(),
  body('full_name').optional({ values: 'null' }).isString(),
  body('remote_work_allowed').optional().isBoolean({ strict: true }),
  body('daily_segments').optional().isInt({ min: 1, max: 2 }),
  body('segment1_start').optional().trim().isString(),
  body('segment1_end').optional().trim().isString(),
  body('segment2_start').optional().trim().isString(),
  body('segment2_end').optional().trim().isString(),
  body('salary_type').optional({ values: 'null' }).isString(),
  body('basic_salary').optional({ values: 'null' }).isNumeric(),
  body('join_date').optional({ values: 'null' }).isString(),
];

const changePasswordValidators = [passwordPolicyValidator()];

const updateUserValidators = [
  body('username').optional().trim().notEmpty(),
  body('role').optional().isIn(['admin', 'employee']),
  body('office_id').optional({ values: 'null' }),
  body('full_name').optional({ values: 'null' }).isString(),
  body('remote_work_allowed').optional().isBoolean({ strict: true }),
  body('daily_segments').optional().isInt({ min: 1, max: 2 }),
  body('segment1_start').optional().trim().isString(),
  body('segment1_end').optional().trim().isString(),
  body('segment2_start').optional().trim().isString(),
  body('segment2_end').optional().trim().isString(),
];

const idParamValidator = [param('id').isInt({ min: 1 })];

const userAttendanceQueryValidators = [query('limit').optional().isInt({ min: 1, max: 500 })];

const officeCreateValidators = [
  body('name').trim().notEmpty(),
  body('locationLink').trim().notEmpty(),
];

const departmentCreateValidators = [body('name').trim().notEmpty()];

const employeeUpdateValidators = [
  body('photo_url').optional().isString().isLength({ max: 2048 }),
  body('contract_status').optional().isString().isLength({ max: 64 }),
  body('department_id').optional().isInt({ min: 1 }),
  body('position_id').optional().isInt({ min: 1 }),
  body('remote_work_allowed').optional().isBoolean({ strict: true }),
  body('daily_segments').optional().isInt({ min: 1, max: 2 }),
  body('segment1_start').optional().trim().isString(),
  body('segment1_end').optional().trim().isString(),
  body('segment2_start').optional().trim().isString(),
  body('segment2_end').optional().trim().isString(),
];

module.exports = {
  loginValidators,
  refreshValidators,
  logoutValidators,
  clockValidators,
  checkInValidators,
  checkOutValidators,
  createUserValidators,
  changePasswordValidators,
  updateUserValidators,
  idParamValidator,
  userAttendanceQueryValidators,
  officeCreateValidators,
  departmentCreateValidators,
  employeeUpdateValidators,
};
