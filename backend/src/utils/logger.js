const winston = require('winston');
const config = require('../config/env');

const isProd = config.nodeEnv === 'production';

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'attendance-api' },
  transports: [
    new winston.transports.Console({
      format: isProd
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
              const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} ${level}: ${stack || message}${rest}`;
            })
          ),
    }),
  ],
  exceptionHandlers: [new winston.transports.Console({ format: winston.format.json() })],
  rejectionHandlers: [new winston.transports.Console({ format: winston.format.json() })],
});

module.exports = { logger };
