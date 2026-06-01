function formatTimeForShift(t) {
  if (t == null) return null;
  const s = String(t);
  if (s.length >= 8) return s.slice(0, 8);
  if (s.length >= 5) return `${s.slice(0, 5)}:00`;
  return s;
}

/** Admin-defined work window for Accounting staff. */
function customShiftFromEmployee(emp) {
  if (!emp) return null;
  const start = formatTimeForShift(emp.custom_work_start);
  const end = formatTimeForShift(emp.custom_work_end);
  if (!start || !end) return null;
  return {
    shift_name: 'Custom',
    start_time: start,
    end_time: end,
    break_duration: 0,
  };
}

function parseWorkTimeInput(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const parts = s.split(':');
    const hh = String(parseInt(parts[0], 10)).padStart(2, '0');
    const mm = String(parseInt(parts[1], 10)).padStart(2, '0');
    const ss = parts[2] != null ? String(parseInt(parts[2], 10)).padStart(2, '0') : '00';
    return `${hh}:${mm}:${ss}`;
  }
  return null;
}

function validateCustomWorkHours(start, end) {
  const a = parseWorkTimeInput(start);
  const b = parseWorkTimeInput(end);
  if (!a || !b) return { ok: false, message: 'Work start and end times are required (HH:MM).' };
  const toMin = (t) => {
    const [hh, mm] = t.split(':').map((x) => parseInt(x, 10));
    return hh * 60 + mm;
  };
  if (toMin(b) <= toMin(a)) {
    return { ok: false, message: 'Work end time must be after start time.' };
  }
  return { ok: true, start: a, end: b };
}

module.exports = {
  formatTimeForShift,
  customShiftFromEmployee,
  parseWorkTimeInput,
  validateCustomWorkHours,
};
