const { Pool, types } = require('pg');
const config = require('../config/env');

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required (PostgreSQL connection string).');
}

// Keep DATE as YYYY-MM-DD. node-pg default (JS Date at local midnight) shifts the
// calendar day when JSON-serialized in non-UTC process timezones (e.g. Asia/Jakarta).
types.setTypeParser(types.builtins.DATE, (val) => val);

const useSsl =
  process.env.DATABASE_SSL === 'true' ||
  /neon\.tech|supabase\.co|pooler\.supabase\.com|sslmode=require/i.test(config.databaseUrl || '');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 30000),
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected PostgreSQL client error', err);
});

module.exports = { pool, query: (text, params) => pool.query(text, params) };
