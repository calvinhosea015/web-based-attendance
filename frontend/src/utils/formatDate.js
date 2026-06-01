/** Display date without ISO time suffix (e.g. 2026-05-01 instead of 2026-05-01T00:00:00.000Z). */
export function formatDisplayDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  return s;
}

export function formatDateRange(start, end) {
  const a = formatDisplayDate(start);
  const b = formatDisplayDate(end);
  if (!a && !b) return '';
  if (a === b) return a;
  return `${a} — ${b}`;
}
