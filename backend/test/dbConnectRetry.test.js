const assert = require('assert');
const {
  isRetryableDbStartupError,
  isQuotaLikeDbError,
} = require('../src/utils/dbConnectRetry');

assert.strictEqual(isRetryableDbStartupError(new Error('connect ETIMEDOUT')), true);
assert.strictEqual(
  isRetryableDbStartupError(
    new Error(
      'Your account or project has exceeded the compute time quota. Upgrade your plan to increase limits.'
    )
  ),
  true
);
assert.strictEqual(isQuotaLikeDbError(new Error('compute time quota')), true);
assert.strictEqual(isRetryableDbStartupError(new Error('syntax error at or near')), false);

console.log('dbConnectRetry self-check passed.');
