const test = require('node:test');
const assert = require('node:assert');
const { nextMidnight, runAutoCheckout } = require('../src/jobs/autoCheckout');

test('nextMidnight returns ms until next 00:00 and the midnight instant', () => {
  const now = new Date('2026-06-25T22:30:15.000Z');
  const { msUntil, target } = nextMidnight('UTC', now);
  // 22:30:15 -> 1h 29m 45s until 00:00 = 5_385_000 ms
  assert.strictEqual(msUntil, 5385000);
  assert.strictEqual(target.toISOString(), '2026-06-26T00:00:00.000Z');
});

test('nextMidnight at exactly midnight schedules a full day ahead', () => {
  const now = new Date('2026-06-25T00:00:00.000Z');
  const { msUntil } = nextMidnight('UTC', now);
  assert.strictEqual(msUntil, 24 * 3600 * 1000);
});

test('runAutoCheckout closes open sessions at the given midnight', async () => {
  const calls = [];
  const repo = {
    autoCheckoutOpenSessions: async (iso) => {
      calls.push(iso);
      return [{ id: 1 }, { id: 2 }];
    },
  };
  const target = new Date('2026-06-26T00:00:00.000Z');
  const closed = await runAutoCheckout(repo, target);
  assert.deepStrictEqual(calls, ['2026-06-26T00:00:00.000Z']);
  assert.strictEqual(closed.length, 2);
});
