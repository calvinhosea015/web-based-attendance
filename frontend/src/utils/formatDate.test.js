import assert from 'node:assert/strict';
import { formatDisplayDate, toCalendarYmd } from './formatDate.js';

assert.equal(toCalendarYmd('2026-07-24'), '2026-07-24');
assert.equal(formatDisplayDate('2026-07-24'), '24/07/2026');

// UTC midnight DATE (UTC-hosted node-pg)
assert.equal(toCalendarYmd('2026-07-24T00:00:00.000Z'), '2026-07-24');
assert.equal(formatDisplayDate('2026-07-24T00:00:00.000Z'), '24/07/2026');

// Asia/Jakarta local midnight for 2026-07-25 (ISO day prefix is 24)
assert.equal(toCalendarYmd('2026-07-24T17:00:00.000Z'), '2026-07-25');
assert.equal(formatDisplayDate('2026-07-24T17:00:00.000Z'), '25/07/2026');

console.log('formatDate.test.js: ok');
