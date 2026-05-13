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

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
