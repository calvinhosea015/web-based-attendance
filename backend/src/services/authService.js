const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/errors');
const config = require('../config/env');
const { assertPasswordPolicy } = require('../utils/passwordPolicy');

class AuthService {
  constructor(userRepository, refreshTokenRepository, auditLogRepository) {
    this.userRepository = userRepository;
    this.refreshTokenRepository = refreshTokenRepository;
    this.auditLogRepository = auditLogRepository;
  }

  issueAccessToken(user) {
    const empId = user.employee_id != null ? Number(user.employee_id) : null;
    const payload = {
      sub: String(user.id),
      role: user.role,
      employeeId: Number.isFinite(empId) && empId > 0 ? empId : null,
    };
    return jwt.sign(payload, config.jwtSecret, { expiresIn: config.accessTokenTtlSec });
  }

  async login(username, password, meta) {
    const user = await this.userRepository.findByUsername(username);
    const passwordOk =
      user?.password_hash && bcrypt.compareSync(password, user.password_hash);
    if (!user || !passwordOk) {
      await this.auditLogRepository
        .logSecurity({
          actorUserId: user?.id || null,
          action: 'login_failed',
          resourceType: 'user',
          resourceId: username,
          details: { username },
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        })
        .catch(() => {});
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    const accessToken = this.issueAccessToken(user);
    const rawRefresh = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 86400000);
    await this.refreshTokenRepository.create({
      userId: user.id,
      rawToken: rawRefresh,
      expiresAt,
      userAgent: meta?.userAgent,
      ipAddress: meta?.ip,
    });

    await this.auditLogRepository
      .logSecurity({
        actorUserId: user.id,
        action: 'login_success',
        resourceType: 'user',
        resourceId: String(user.id),
        details: {},
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      })
      .catch(() => {});

    return {
      token: accessToken,
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: config.accessTokenTtlSec,
      tokenType: 'Bearer',
      role: user.role,
      employeeId: user.employee_id,
      fullName: user.full_name || null,
    };
  }

  async refresh(refreshTokenRaw, meta) {
    if (!refreshTokenRaw) {
      throw new AppError('Refresh token required.', 400, 'REFRESH_REQUIRED');
    }
    const row = await this.refreshTokenRepository.findValidByRaw(refreshTokenRaw);
    if (!row) {
      throw new AppError('Invalid or expired refresh token.', 401, 'REFRESH_INVALID');
    }
    const user = await this.userRepository.findById(row.user_id);
    if (!user) {
      throw new AppError('User not found.', 401, 'USER_MISSING');
    }
    await this.refreshTokenRepository.revokeByRaw(refreshTokenRaw);
    const accessToken = this.issueAccessToken(user);
    const rawRefresh = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 86400000);
    await this.refreshTokenRepository.create({
      userId: user.id,
      rawToken: rawRefresh,
      expiresAt,
      userAgent: meta?.userAgent,
      ipAddress: meta?.ip,
    });
    await this.auditLogRepository
      .logSecurity({
        actorUserId: user.id,
        action: 'token_refresh',
        resourceType: 'user',
        resourceId: String(user.id),
        details: {},
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      })
      .catch(() => {});

    return {
      token: accessToken,
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: config.accessTokenTtlSec,
      tokenType: 'Bearer',
      role: user.role,
      employeeId: user.employee_id,
      fullName: user.full_name || null,
    };
  }

  async logout(refreshTokenRaw, userId, meta) {
    if (refreshTokenRaw) {
      await this.refreshTokenRepository.revokeByRaw(refreshTokenRaw);
    } else if (userId) {
      await this.refreshTokenRepository.revokeAllForUser(userId);
    } else {
      throw new AppError(
        'Send refreshToken in body, or authenticate to revoke all sessions.',
        400,
        'LOGOUT_BODY'
      );
    }
    await this.auditLogRepository
      .logSecurity({
        actorUserId: userId || null,
        action: 'logout',
        resourceType: 'user',
        resourceId: userId ? String(userId) : null,
        details: {},
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      })
      .catch(() => {});
    return { message: 'Logged out.' };
  }
}

module.exports = { AuthService };
