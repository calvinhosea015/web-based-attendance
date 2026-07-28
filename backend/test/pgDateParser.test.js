const assert = require('node:assert/strict');
const { types } = require('pg');

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://attendance:attendance@127.0.0.1:5432/attendance';
}

require('../src/db/pool');

const parse = types.getTypeParser(types.builtins.DATE);
assert.equal(parse('2026-07-24'), '2026-07-24');
assert.equal(typeof parse('2026-07-24'), 'string');

console.log('pgDateParser.test.js: ok');
