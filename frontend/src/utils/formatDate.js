/** Parse API / DB date values into calendar parts. */
export function parseDateParts(value) {
  if (value == null || value === '') return null;

  if (typeof value === 'string') {
    const s = value.trim();
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (ymd) {
      return { d: +ymd[3], m: +ymd[2], y: +ymd[1], hasTime: false };
    }
    const ymdMidnight = /^(\d{4})-(\d{2})-(\d{2})T00:00:00/.exec(s);
    if (ymdMidnight) {
      return { d: +ymdMidnight[3], m: +ymdMidnight[2], y: +ymdMidnight[1], hasTime: false };
    }
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  return {
    d: d.getDate(),
    m: d.getMonth() + 1,
    y: d.getFullYear(),
    h: d.getHours(),
    min: d.getMinutes(),
    hasTime: true,
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Date only: dd/mm/yyyy */
export function formatDisplayDate(value) {
  const p = parseDateParts(value);
  if (!p) return '';
  return `${pad2(p.d)}/${pad2(p.m)}/${p.y}`;
}

/** Date and time: dd/mm/yyyy HH:mm (24-hour) */
export function formatDisplayDateTime(value) {
  const p = parseDateParts(value);
  if (!p) return '';
  const date = `${pad2(p.d)}/${pad2(p.m)}/${p.y}`;
  if (p.hasTime) return `${date} ${pad2(p.h)}:${pad2(p.min)}`;
  return date;
}

export function formatDateRange(start, end) {
  const a = formatDisplayDate(start);
  const b = formatDisplayDate(end);
  if (!a && !b) return '';
  if (a === b) return a;
  return `${a} — ${b}`;
}
