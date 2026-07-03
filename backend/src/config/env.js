require('dotenv').config();

const parseList = (s) =>
  (s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

module.exports = {
  port: parseInt(process.env.PORT || '5001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  cookieSecret: process.env.COOKIE_SECRET || process.env.JWT_SECRET || 'change-me-in-production',
  databaseUrl: process.env.DATABASE_URL,
  officeRadiusMeters: parseInt(process.env.OFFICE_RADIUS_METERS || '500', 10),
  /** Extra meters allowed toward reported GPS uncertainty (capped so accuracy cannot be abused). */
  officeRadiusGpsBufferCapMeters: parseFloat(process.env.OFFICE_RADIUS_GPS_BUFFER_CAP_METERS || '200'),
  maxGpsAccuracyMeters: parseFloat(process.env.MAX_GPS_ACCURACY_METERS || '400'),
  maxClientClockSkewMs: parseInt(process.env.MAX_CLIENT_CLOCK_SKEW_MS || String(5 * 60 * 1000), 10),
  maxImpossibleSpeedMps: parseFloat(process.env.MAX_IMPOSSIBLE_SPEED_MPS || '50'),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '300', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  accessTokenTtlSec: parseInt(process.env.ACCESS_TOKEN_TTL_SEC || '900', 10),
  refreshTokenTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '14', 10),
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10),
  allowedOrigins: parseList(process.env.ALLOWED_ORIGINS),
  csrfEnabled: process.env.CSRF_ENABLED !== 'false',
  activityLogEnabled: process.env.ACTIVITY_LOG_ENABLED !== 'false',
  /** Calendar day for attendance (check-in/out “today”) — use office local TZ. */
  attendanceCalendarTz: process.env.ATTENDANCE_CALENDAR_TZ || 'Asia/Jakarta',
};
