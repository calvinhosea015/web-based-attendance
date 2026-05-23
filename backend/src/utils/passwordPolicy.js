const { AppError } = require('./errors');
const config = require('../config/env');

const ALPHANUMERIC = /^[a-zA-Z0-9]+$/;

function assertPasswordPolicy(password) {
  if (!password || typeof password !== 'string') {
    throw new AppError('Password is required.', 400, 'PASSWORD_POLICY');
  }
  if (password.length < config.passwordMinLength) {
    throw new AppError(
      `Password must be at least ${config.passwordMinLength} characters.`,
      400,
      'PASSWORD_POLICY'
    );
  }
  if (!ALPHANUMERIC.test(password)) {
    throw new AppError(
      'Password must contain only letters and numbers.',
      400,
      'PASSWORD_POLICY'
    );
  }
}

module.exports = { assertPasswordPolicy };
