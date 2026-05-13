const { AppError } = require('./errors');
const config = require('../config/env');

/**
 * Enterprise password policy (NIST-aligned: length + character classes).
 */
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
  if (!config.passwordRequireComplexity) return;

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=[\]{}|\\:;"'<>,.?/`~]/.test(password);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (classes < 4) {
    throw new AppError(
      'Password must include uppercase, lowercase, a number, and a symbol.',
      400,
      'PASSWORD_POLICY'
    );
  }
}

module.exports = { assertPasswordPolicy };
