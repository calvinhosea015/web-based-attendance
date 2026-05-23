const { Pool } = require('pg');
const config = require('../config/env');

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required (PostgreSQL connection string).');
}

const useSsl =
  process.env.DATABASE_SSL === 'true' ||
  /neon\.tech|sslmode=require/i.test(config.databaseUrl || '');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected PostgreSQL client error', err);
});

module.exports = { pool, query: (text, params) => pool.query(text, params) };
