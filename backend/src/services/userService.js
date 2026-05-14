const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');
const { AppError } = require('../utils/errors');
const { MetaRepository } = require('../repositories/metaRepository');
const { assertPasswordPolicy } = require('../utils/passwordPolicy');
const { normalizeTimeForDb, segmentsCompleteInDb } = require('../utils/timeOfDay');
const config = require('../config/env');

function stripUserSecrets(row) {
  if (!row) return null;
  const { password_hash: _p, ...rest } = row;
  return rest;
}

async function applyShiftSegmentRules(userRepository, employeeRepository, userId, payload, has) {
  const fresh = await userRepository.findById(userId);
  if (!fresh?.employee_id || fresh.role !== 'employee') return;

  const empRow = await employeeRepository.findById(fresh.employee_id);
  if (!empRow) return;

  if (has('daily_segments')) {
    if (Number(payload.daily_segments) !== 2) {
      await employeeRepository.enforceStandardShift(fresh.employee_id);
      await employeeRepository.updateEnterpriseFields(fresh.employee_id, {
        segment1_start: null,
        segment1_end: null,
        segment2_start: null,
        segment2_end: null,
      });
      return;
    }
    const existingOk = segmentsCompleteInDb(empRow);
    const payloadHasAll = ['segment1_start', 'segment1_end', 'segment2_start', 'segment2_end'].every((k) =>
      has(k)
    );
    if (!existingOk && !payloadHasAll) {
      throw new AppError(
        'Four shift times (segment1_start, segment1_end, segment2_start, segment2_end) are required for four clocks per day.',
        400,
        'SPLIT_SHIFT_TIMES'
      );
    }
    if (payloadHasAll) {
      await employeeRepository.updateEnterpriseFields(fresh.employee_id, {
        segment1_start: normalizeTimeForDb(payload.segment1_start),
        segment1_end: normalizeTimeForDb(payload.segment1_end),
        segment2_start: normalizeTimeForDb(payload.segment2_start),
        segment2_end: normalizeTimeForDb(payload.segment2_end),
      });
    }
    return;
  }

  const ds = Number(empRow.daily_segments) === 2 ? 2 : 1;
  if (ds !== 2) return;

  const keys = ['segment1_start', 'segment1_end', 'segment2_start', 'segment2_end'];
  if (keys.some((k) => has(k)) && !keys.every((k) => has(k))) {
    throw new AppError('Send all four segment times together.', 400, 'SPLIT_SHIFT_TIMES');
  }
  if (keys.every((k) => has(k))) {
    await employeeRepository.updateEnterpriseFields(fresh.employee_id, {
      segment1_start: normalizeTimeForDb(payload.segment1_start),
      segment1_end: normalizeTimeForDb(payload.segment1_end),
      segment2_start: normalizeTimeForDb(payload.segment2_start),
      segment2_end: normalizeTimeForDb(payload.segment2_end),
    });
  }
}

class UserService {
  constructor(userRepository, employeeRepository) {
    this.userRepository = userRepository;
    this.employeeRepository = employeeRepository;
    this.metaRepository = new MetaRepository();
  }

  async list() {
    return this.userRepository.listSummary();
  }

  async createUser(payload) {
    const {
      username,
      password,
      role,
      office_id: officeId,
      employee_id: employeeCode,
      full_name: fullName,
    } = payload;

    if (!username || !password || !role) {
      throw new AppError('Username, password, and role are required.', 400, 'USER_FIELDS');
    }
    assertPasswordPolicy(password);
    if (!['admin', 'employee'].includes(role)) {
      throw new AppError('Invalid role.', 400, 'ROLE');
    }
    if (role === 'employee' && !officeId) {
      throw new AppError('Employees require an assigned office (office_id).', 400, 'OFFICE_REQUIRED');
    }

    const has = (k) => Object.prototype.hasOwnProperty.call(payload, k);
    const remoteWorkAllowed = has('remote_work_allowed') ? Boolean(payload.remote_work_allowed) : true;
    const dailySegments = has('daily_segments') ? (Number(payload.daily_segments) === 2 ? 2 : 1) : 1;

    const segmentKeys = ['segment1_start', 'segment1_end', 'segment2_start', 'segment2_end'];
    let segmentTimes = {};
    if (dailySegments === 2) {
      if (!segmentKeys.every((k) => has(k))) {
        throw new AppError(
          'Four shift times (segment1_start, segment1_end, segment2_start, segment2_end) are required for four clocks per day.',
          400,
          'SPLIT_SHIFT_TIMES'
        );
      }
      segmentTimes = {
        segment1_start: normalizeTimeForDb(payload.segment1_start),
        segment1_end: normalizeTimeForDb(payload.segment1_end),
        segment2_start: normalizeTimeForDb(payload.segment2_start),
        segment2_end: normalizeTimeForDb(payload.segment2_end),
      };
    }

    let employeeId = null;
    let createdEmployee = null;
    if (role === 'employee') {
      if (!fullName) {
        throw new AppError('Employees require full_name.', 400, 'EMPLOYEE_FIELDS');
      }
      const trimmedCode = employeeCode && String(employeeCode).trim();
      const { departmentId, positionId } = await this.metaRepository.defaultDepartmentAndPosition();
      const empPayload = {
        fullName,
        departmentId,
        positionId,
        salaryType: payload.salary_type || 'monthly',
        basicSalary: payload.basic_salary ?? 0,
        joinDate: payload.join_date,
        status: 'active',
        remoteWorkAllowed,
        dailySegments,
        ...segmentTimes,
      };
      let emp;
      if (trimmedCode) {
        emp = await this.employeeRepository.create({
          employeeId: trimmedCode,
          ...empPayload,
        });
      } else {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const code = await this.employeeRepository.nextEmployeeCode();
          try {
            emp = await this.employeeRepository.create({
              employeeId: code,
              ...empPayload,
            });
            break;
          } catch (e) {
            if (e.code !== '23505' || attempt === 4) throw e;
          }
        }
      }
      employeeId = emp.id;
      createdEmployee = emp;
      await this.employeeRepository.assignDefaultShiftIfMissing(emp.id);
    }

    const passwordHash = bcrypt.hashSync(password, config.bcryptRounds);

    try {
      const userRow = await this.userRepository.create({
        username,
        passwordHash,
        role,
        officeId: role === 'employee' ? officeId : officeId || null,
        employeeId,
      });
      if (createdEmployee) {
        return { ...userRow, employee_code: createdEmployee.employee_id };
      }
      return userRow;
    } catch (e) {
      if (e.code === '23505') {
        throw new AppError('Username or employee id already exists.', 409, 'DUPLICATE');
      }
      throw e;
    }
  }

  async deleteUser(id) {
    await this.userRepository.delete(id);
  }

  async changePassword(id, password) {
    if (!password) throw new AppError('Password is required', 400, 'PASSWORD');
    assertPasswordPolicy(password);
    const hash = bcrypt.hashSync(password, config.bcryptRounds);
    await this.userRepository.updatePassword(id, hash);
  }

  /**
   * @param {string|number} id
   * @param {Record<string, unknown>} payload
   */
  async updateUser(id, payload) {
    const has = (k) => Object.prototype.hasOwnProperty.call(payload, k);
    const userId = Number(id);
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError('User not found.', 404, 'NOT_FOUND');

    const allowedKeys = [
      'username',
      'role',
      'office_id',
      'full_name',
      'remote_work_allowed',
      'daily_segments',
      'segment1_start',
      'segment1_end',
      'segment2_start',
      'segment2_end',
    ];
    if (!allowedKeys.some((k) => has(k))) {
      throw new AppError(
        'At least one of username, role, office_id, full_name, remote_work_allowed, daily_segments, or segment times is required.',
        400,
        'NO_FIELDS'
      );
    }

    const syncEmployeePolicies = async () => {
      const latest = await this.userRepository.findById(userId);
      if (!latest?.employee_id) return;
      const epatch = {};
      if (has('remote_work_allowed')) epatch.remote_work_allowed = Boolean(payload.remote_work_allowed);
      if (has('daily_segments')) epatch.daily_segments = Number(payload.daily_segments) === 2 ? 2 : 1;
      if (Object.keys(epatch).length) {
        await this.employeeRepository.updateEnterpriseFields(latest.employee_id, epatch);
      }
    };

    let newUsername;
    if (has('username')) {
      newUsername = String(payload.username).trim();
      if (!newUsername) throw new AppError('Username cannot be empty.', 400);
      if (newUsername !== user.username) {
        if (await this.userRepository.existsUsernameExcept(newUsername, userId)) {
          throw new AppError('Username already exists.', 409, 'DUPLICATE');
        }
      }
    }

    const newRole = has('role') ? payload.role : undefined;
    if (newRole !== undefined && !['admin', 'employee'].includes(newRole)) {
      throw new AppError('Invalid role.', 400, 'ROLE');
    }

    const effectiveRole = newRole !== undefined ? newRole : user.role;
    const prevRole = user.role;

    let newOfficeIdValue;
    if (has('office_id')) {
      const raw = payload.office_id;
      if (raw === null || raw === '') newOfficeIdValue = null;
      else {
        newOfficeIdValue = Number(raw);
        if (!Number.isFinite(newOfficeIdValue) || newOfficeIdValue < 1) {
          throw new AppError('Invalid office_id.', 400);
        }
      }
    }

    let newFullNameRaw;
    if (has('full_name')) {
      newFullNameRaw = String(payload.full_name).trim();
      if (!newFullNameRaw) throw new AppError('full_name cannot be empty.', 400);
    }

    const empFk = user.employee_id;

    if (effectiveRole === 'employee' && empFk && newFullNameRaw !== undefined) {
      await this.employeeRepository.updateFullName(empFk, newFullNameRaw);
    }

    if (prevRole === 'employee' && effectiveRole === 'admin') {
      const patch = { role: 'admin', employeeId: null };
      if (newUsername !== undefined) patch.username = newUsername;
      if (newOfficeIdValue !== undefined) patch.officeId = newOfficeIdValue;
      else patch.officeId = user.office_id;
      try {
        await this.userRepository.updatePatch(userId, patch);
      } catch (e) {
        if (e.code === '23505') {
          throw new AppError('Username already exists.', 409, 'DUPLICATE');
        }
        throw e;
      }
      return stripUserSecrets(await this.userRepository.findById(userId));
    }

    if (prevRole === 'admin' && effectiveRole === 'employee') {
      if (newFullNameRaw === undefined) {
        throw new AppError('full_name is required when changing role to employee.', 400, 'EMPLOYEE_FIELDS');
      }
      const dailySeg = has('daily_segments') ? (Number(payload.daily_segments) === 2 ? 2 : 1) : 1;
      const segmentKeys = ['segment1_start', 'segment1_end', 'segment2_start', 'segment2_end'];
      let segmentTimes = {};
      if (dailySeg === 2) {
        if (!segmentKeys.every((k) => has(k))) {
          throw new AppError(
            'Four shift times are required when using four clocks per day.',
            400,
            'SPLIT_SHIFT_TIMES'
          );
        }
        segmentTimes = {
          segment1_start: normalizeTimeForDb(payload.segment1_start),
          segment1_end: normalizeTimeForDb(payload.segment1_end),
          segment2_start: normalizeTimeForDb(payload.segment2_start),
          segment2_end: normalizeTimeForDb(payload.segment2_end),
        };
      }
      const { departmentId, positionId } = await this.metaRepository.defaultDepartmentAndPosition();
      let emp;
      const client = await pool.connect();
      let began = false;
      try {
        await client.query('BEGIN');
        began = true;
        const exec = (text, params) => client.query(text, params);
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const code = await this.employeeRepository.nextEmployeeCode();
          try {
            emp = await this.employeeRepository.create(
              {
                employeeId: code,
                fullName: newFullNameRaw,
                departmentId,
                positionId,
                salaryType: 'monthly',
                basicSalary: 0,
                joinDate: new Date().toISOString().slice(0, 10),
                status: 'active',
                remoteWorkAllowed: has('remote_work_allowed') ? Boolean(payload.remote_work_allowed) : true,
                dailySegments: dailySeg,
                ...segmentTimes,
              },
              exec
            );
            break;
          } catch (e) {
            if (e.code !== '23505' || attempt === 4) throw e;
          }
        }
        const office =
          newOfficeIdValue !== undefined
            ? newOfficeIdValue
            : (await this.metaRepository.firstOfficeId());
        if (!office) throw new AppError('No office configured; create an office first.', 400);

        const patch = { role: 'employee', employeeId: emp.id, officeId: office };
        if (newUsername !== undefined) patch.username = newUsername;
        await this.userRepository.updatePatch(userId, patch, exec);
        await client.query('COMMIT');
      } catch (e) {
        if (began) await client.query('ROLLBACK').catch(() => {});
        if (e.code === '23505') {
          throw new AppError('Username or employee id already exists.', 409, 'DUPLICATE');
        }
        throw e;
      } finally {
        client.release();
      }

      await this.employeeRepository.assignDefaultShiftIfMissing(emp.id);
      await syncEmployeePolicies();
      await applyShiftSegmentRules(this.userRepository, this.employeeRepository, userId, payload, has);
      const updated = stripUserSecrets(await this.userRepository.findById(userId));
      return { ...updated, employee_code: emp.employee_id };
    }

    const patch = {};
    if (newUsername !== undefined) patch.username = newUsername;
    if (newRole !== undefined) patch.role = newRole;
    if (newOfficeIdValue !== undefined) {
      let oid = newOfficeIdValue;
      if (effectiveRole === 'employee' && !oid) {
        oid = await this.metaRepository.firstOfficeId();
      }
      patch.officeId = effectiveRole === 'employee' ? oid : newOfficeIdValue;
    }

    if (Object.keys(patch).length) {
      try {
        await this.userRepository.updatePatch(userId, patch);
      } catch (e) {
        if (e.code === '23505') {
          throw new AppError('Username already exists.', 409, 'DUPLICATE');
        }
        throw e;
      }
    }

    await syncEmployeePolicies();
    await applyShiftSegmentRules(this.userRepository, this.employeeRepository, userId, payload, has);
    return stripUserSecrets(await this.userRepository.findById(userId));
  }
}

module.exports = { UserService };
