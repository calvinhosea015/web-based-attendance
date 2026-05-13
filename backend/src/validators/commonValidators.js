const { body, param } = require('express-validator');
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
  body('client_ts_ms').isInt({ min: 1 }).withMessage('client_ts_ms required'),
];

const checkInValidators = [
  ...clockValidators,
  body('office_id').isInt({ min: 1 }).withMessage('office_id required'),
  body('remote_work').optional().isBoolean(),
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
  body('office_id').optional().isInt({ min: 1 }),
  body('employee_id').optional().isString(),
  body('full_name').optional().isString(),
  body('salary_type').optional().isString(),
  body('basic_salary').optional().isNumeric(),
  body('join_date').optional().isString(),
];

const changePasswordValidators = [passwordPolicyValidator()];

const idParamValidator = [param('id').isInt({ min: 1 })];

const officeCreateValidators = [
  body('name').trim().notEmpty(),
  body('locationLink').trim().notEmpty(),
];

const departmentCreateValidators = [body('name').trim().notEmpty()];

const approvalDecisionValidators = [
  body('status').isIn(['approved', 'rejected']).withMessage('status must be approved or rejected'),
  body('rejectionReason').optional().isString(),
];

const employeeUpdateValidators = [
  body('photo_url').optional().isString().isLength({ max: 2048 }),
  body('contract_status').optional().isString().isLength({ max: 64 }),
  body('department_id').optional().isInt({ min: 1 }),
  body('position_id').optional().isInt({ min: 1 }),
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
  idParamValidator,
  officeCreateValidators,
  departmentCreateValidators,
  approvalDecisionValidators,
  employeeUpdateValidators,
};
