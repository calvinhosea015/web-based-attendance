const { AppError } = require('./errors');

/**
 * Normalize UI/API time to HH:MM:SS for PostgreSQL TIME columns.
 * @param {unknown} input
 * @returns {string|null}
 */
function normalizeTimeForDb(input) {
  if (input == null || input === '') return null;
  const s = String(input).trim();
  const isoFrag = s.match(/T(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i);
  if (isoFrag) {
    const h = parseInt(isoFrag[1], 10);
    const mm = parseInt(isoFrag[2], 10);
    const ss = isoFrag[3] != null ? parseInt(isoFrag[3], 10) : 0;
    if (h >= 0 && h <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59) {
      return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }
  }
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) {
    throw new AppError('Invalid time format. Use HH:MM or HH:MM:SS.', 400, 'BAD_TIME');
  }
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const ss = m[3] != null ? parseInt(m[3], 10) : 0;
  if (h < 0 || h > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) {
    throw new AppError('Invalid clock time.', 400, 'BAD_TIME');
  }
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function segmentsCompleteInDb(emp) {
  return !!(
    emp &&
    emp.segment1_start &&
    emp.segment1_end &&
    emp.segment2_start &&
    emp.segment2_end
  );
}

module.exports = { normalizeTimeForDb, segmentsCompleteInDb };
