/** Normalize PostgreSQL DATE / timestamp values to YYYY-MM-DD for JSON APIs. */
function toYmd(value) {
  if (value == null || value === '') return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value).trim());
  return m ? m[1] : String(value);
}

function mapLeaveRow(row) {
  if (!row) return row;
  return {
    ...row,
    start_date: toYmd(row.start_date),
    end_date: toYmd(row.end_date),
  };
}

function mapLeaveRows(rows) {
  return (rows || []).map(mapLeaveRow);
}

module.exports = { toYmd, mapLeaveRow, mapLeaveRows };
