const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const { swaggerSpec } = require('./config/swagger');
const config = require('./config/env');
const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const { requestContext } = require('./middleware/requestContext');
const { buildV1Router } = require('./routes/v1');

function corsOrigin(origin, cb) {
  if (!config.allowedOrigins.length) {
    return cb(null, true);
  }
  if (!origin) return cb(null, true);
  if (config.allowedOrigins.includes(origin)) return cb(null, true);
  return cb(null, false);
}

function attachFrontend(app) {
  const serve =
    process.env.SERVE_FRONTEND === 'true' ||
    (config.nodeEnv === 'production' && process.env.SERVE_FRONTEND !== 'false');
  if (!serve) return;

  const dist = path.resolve(__dirname, '../../frontend/dist');
  const indexHtml = path.join(dist, 'index.html');
  if (!fs.existsSync(indexHtml)) return;

  app.use(express.static(dist, { index: false }));
  app.get(/^(?!\/api|\/health|\/api-docs).*/, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(indexHtml);
  });
}

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
      exposedHeaders: ['Content-Disposition'],
    })
  );
  app.use(cookieParser(config.cookieSecret));
  app.use(hpp());
  app.use(express.json({ limit: '1mb' }));
  app.use(requestContext);

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  const spec = swaggerSpec();
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));

  app.use('/api/v1', apiLimiter, buildV1Router());

  attachFrontend(app);

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
