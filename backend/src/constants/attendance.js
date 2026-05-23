const ATTENDANCE_STATUSES = Object.freeze({
  PRESENT: 'PRESENT',
  LATE: 'LATE',
  EARLY_LEAVE: 'EARLY_LEAVE',
  ABSENT: 'ABSENT',
  HALF_DAY: 'HALF_DAY',
  OVERTIME: 'OVERTIME',
  REMOTE_WORK: 'REMOTE_WORK',
  ON_LEAVE: 'ON_LEAVE',
  SICK_LEAVE: 'SICK_LEAVE',
});

/** One attendance segment per day: single check-in, single check-out. */
const CLOCK_SEGMENTS_PER_DAY = 1;

module.exports = { ATTENDANCE_STATUSES, CLOCK_SEGMENTS_PER_DAY };
