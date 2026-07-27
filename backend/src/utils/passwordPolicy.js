const { AppError } = require('./errors');
const config = require('../config/env');

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
}

module.exports = { assertPasswordPolicy };
