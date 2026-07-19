const { createApp } = require('./app');
const config = require('./config/env');
const { migrate } = require('./db/migrate');
const { logger } = require('./utils/logger');
const { startAutoCheckoutScheduler } = require('./jobs/autoCheckout');
const {
  isRetryableDbStartupError,
  isQuotaLikeDbError,
} = require('./utils/dbConnectRetry');

async function migrateWithRetry() {
  // ponytail: Neon free-tier quota can block for tens of minutes after reboot; keep trying.
  // Ceiling: DB_CONNECT_RETRIES × delay (~40×30s default). Upgrade: paid Neon or local Postgres.
  const maxAttempts = Number(process.env.DB_CONNECT_RETRIES || 40);
  const delayMs = Number(process.env.DB_CONNECT_RETRY_MS || 30000);
  const quotaDelayMs = Number(process.env.DB_QUOTA_RETRY_MS || 60000);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await migrate();
      return;
    } catch (err) {
      const msg = String(err.message || err);
      if (!isRetryableDbStartupError(err) || attempt === maxAttempts) throw err;
      const wait = isQuotaLikeDbError(err) ? quotaDelayMs : delayMs;
      logger.warn(`Database not ready (attempt ${attempt}/${maxAttempts}, wait ${wait}ms): ${msg}`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

async function start() {
  await migrateWithRetry();
  const app = createApp();
  app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`);
  });
  startAutoCheckoutScheduler();
}

start().catch((err) => {
  logger.error('Fatal startup error', { message: err.message, stack: err.stack });
  if (err.code === 'ECONNREFUSED' && String(err.message || '').includes('5432')) {
    // eslint-disable-next-line no-console
    console.error(`
PostgreSQL is not reachable (connection refused on port 5432).

Fix one of these:
  1) Start Docker Desktop, then from the repo root:  docker compose up -d
  2) Or install Postgres locally and create the DB/user matching DATABASE_URL in backend/.env
     Example (Homebrew, Apple Silicon — adjust PATH for Intel Mac):
       brew install postgresql@16 && brew services start postgresql@16
       export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
       psql -d postgres -c "CREATE ROLE attendance WITH LOGIN PASSWORD 'attendance';" || true
       psql -d postgres -c "CREATE DATABASE attendance OWNER attendance;" || true
`);
  }
  process.exit(1);
});

module.exports = { start };
