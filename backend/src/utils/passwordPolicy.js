const { AppError } = require('./errors');
const config = require('../config/env');

const HAS_LETTER = /[a-zA-Z]/;
const HAS_DIGIT = /[0-9]/;

function assertPasswordPolicy(password) {
  if (!password || typeof password !== 'string') {
    throw new AppError('Password is required.', 400, 'PASSWORD_POLICY');
  }
  if (password.length < config.passwordMinLength) {
    throw new AppError(
      `Password must be at least ${config.passwordMinLength} characters.`,
      400,
      'PASSWORD_MIN_LENGTH',
      { min: config.passwordMinLength }
    );
  }
  if (!HAS_LETTER.test(password) || !HAS_DIGIT.test(password)) {
    throw new AppError(
      'Password must contain at least one letter and one number.',
      400,
      'PASSWORD_ALPHANUMERIC'
    );
  }
}

module.exports = { assertPasswordPolicy };
