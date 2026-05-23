const config = require('../config/env');

/** YYYY-MM-DD in the configured attendance timezone (default Asia/Jakarta). */
function attendanceCalendarDayStr(date = new Date(), timeZone = config.attendanceCalendarTz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

module.exports = { attendanceCalendarDayStr };
