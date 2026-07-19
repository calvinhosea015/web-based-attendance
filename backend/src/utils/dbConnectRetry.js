/** Transient Neon/Postgres failures that should not kill boot permanently. */
function isRetryableDbStartupError(err) {
  const msg = String((err && err.message) || err || '');
  return /timeout|ECONNREFUSED|ENOTFOUND|terminated|connect|EAI_AGAIN|quota|compute time|too many connections|remaining connection slots|cannot acquire|Connection terminated|server closed the connection/i.test(
    msg
  );
}

function isQuotaLikeDbError(err) {
  const msg = String((err && err.message) || err || '');
  return /quota|compute time|Upgrade your plan/i.test(msg);
}

module.exports = { isRetryableDbStartupError, isQuotaLikeDbError };
