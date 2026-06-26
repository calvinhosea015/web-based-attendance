const { AttendanceRepository } = require('../repositories/attendanceRepository');
const config = require('../config/env');
const { logger } = require('../utils/logger');

/**
 * ms until the next 00:00 in `tz`, plus the midnight instant itself.
 * `now`/`tz` are injectable for tests. Asia/Jakarta has no DST, but deriving the
 * wall-clock from Intl keeps this correct for any configured timezone.
 */
function nextMidnight(tz = config.attendanceCalendarTz, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  const hour = get('hour') % 24; // some ICU builds report midnight as '24'
  const msIntoDay = ((hour * 60 + get('minute')) * 60 + get('second')) * 1000 + now.getMilliseconds();
  const msUntil = 24 * 3600 * 1000 - msIntoDay;
  return { msUntil, target: new Date(now.getTime() + msUntil) };
}

async function runAutoCheckout(repo, target) {
  const closed = await repo.autoCheckoutOpenSessions(target.toISOString());
  if (closed.length) {
    logger.info('Auto check-out closed open sessions at midnight', {
      service: 'attendance-api',
      count: closed.length,
      at: target.toISOString(),
    });
  }
  return closed;
}

/**
 * Run the auto check-out once at the next local midnight, then reschedule for the
 * following day. Recomputing the delay each cycle avoids setInterval drift.
 *
 * ponytail: single-process timer. If multiple API instances ever run, each fires,
 * but the `check_out IS NULL` filter makes the work idempotent so it stays correct.
 */
function startAutoCheckoutScheduler(repo = new AttendanceRepository()) {
  const schedule = () => {
    const { msUntil, target } = nextMidnight();
    const timer = setTimeout(async () => {
      try {
        await runAutoCheckout(repo, target);
      } catch (err) {
        logger.error('Auto check-out failed', {
          service: 'attendance-api',
          message: err.message,
        });
      } finally {
        schedule();
      }
    }, msUntil);
    timer.unref?.(); // don't keep the process alive solely for this timer
  };
  schedule();
}

module.exports = { startAutoCheckoutScheduler, nextMidnight, runAutoCheckout };
