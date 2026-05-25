const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');
const { AppError } = require('../utils/errors');
const { MetaRepository } = require('../repositories/metaRepository');
const { assertPasswordPolicy } = require('../utils/passwordPolicy');
const config = require('../config/env');
const { ROLES, isValidRole, isAttendanceRole, requiresFullName } = require('../constants/roles');
const { CLOCK_SEGMENTS_PER_DAY } = require('../constants/attendance');

function stripUserSecrets(row) {
  if (!row) return null;
  const { password_hash: _p, ...rest } = row;
  return rest;
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
    if (!isValidRole(role)) {
      throw new AppError('Invalid role.', 400, 'ROLE');
    }
    if (isAttendanceRole(role) && !officeId) {
      throw new AppError('Employees require an assigned office (office_id).', 400, 'OFFICE_REQUIRED');
    }

    const has = (k) => Object.prototype.hasOwnProperty.call(payload, k);
    const remoteWorkAllowed = has('remote_work_allowed') ? Boolean(payload.remote_work_allowed) : true;

    let employeeId = null;
    let createdEmployee = null;
    if (isAttendanceRole(role)) {
      const trimmedFullName = fullName && String(fullName).trim();
      if (requiresFullName(role) && !trimmedFullName) {
        throw new AppError('full_name is required for Staff Kantor and Petugas Lapangan.', 400, 'EMPLOYEE_FIELDS');
      }
      const resolvedFullName = trimmedFullName;
      const trimmedCode = employeeCode && String(employeeCode).trim();
      const { departmentId, positionId } = await this.metaRepository.defaultDepartmentAndPosition();
      const empPayload = {
        fullName: resolvedFullName,
        departmentId,
        positionId,
        salaryType: payload.salary_type || 'monthly',
        basicSalary: payload.basic_salary ?? 0,
        upahHarian: payload.upah_harian ?? 0,
        joinDate: payload.join_date,
        birthday: payload.birthday || null,
        status: 'active',
        remoteWorkAllowed,
        dailySegments: CLOCK_SEGMENTS_PER_DAY,
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
        officeId: isAttendanceRole(role) ? officeId : officeId || null,
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
    const userId = Number(id);
    if (!Number.isFinite(userId) || userId < 1) {
      throw new AppError('User not found.', 404, 'NOT_FOUND');
    }
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError('User not found.', 404, 'NOT_FOUND');
    if (user.role === ROLES.ADMIN) {
      throw new AppError('Admin accounts cannot be deleted.', 403, 'CANNOT_DELETE_ADMIN');
    }
    const empId = user.employee_id != null ? Number(user.employee_id) : null;
    await this.userRepository.delete(userId, Number.isFinite(empId) && empId > 0 ? empId : null);
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
      'join_date',
      'birthday',
    ];
    if (!allowedKeys.some((k) => has(k))) {
      throw new AppError(
        'At least one of username, role, office_id, full_name, remote_work_allowed, join_date, or birthday is required.',
        400,
        'NO_FIELDS'
      );
    }

    const normalizeOptionalDate = (value) => {
      if (value === '' || value === null || value === undefined) return null;
      return String(value);
    };

    const syncEmployeePolicies = async () => {
      const latest = await this.userRepository.findById(userId);
      if (!latest?.employee_id) return;
      if (!has('remote_work_allowed')) return;
      await this.employeeRepository.updateEnterpriseFields(latest.employee_id, {
        remote_work_allowed: Boolean(payload.remote_work_allowed),
        daily_segments: CLOCK_SEGMENTS_PER_DAY,
      });
    };

    const syncEmployeeHrFields = async () => {
      const latest = await this.userRepository.findById(userId);
      if (!latest?.employee_id) return;
      const patch = {};
      if (has('join_date')) patch.join_date = normalizeOptionalDate(payload.join_date);
      if (has('birthday')) patch.birthday = normalizeOptionalDate(payload.birthday);
      if (Object.keys(patch).length) {
        await this.employeeRepository.updateEnterpriseFields(latest.employee_id, patch);
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
    if (newRole !== undefined && !isValidRole(newRole)) {
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
      if (!newFullNameRaw && requiresFullName(effectiveRole)) {
        throw new AppError('full_name cannot be empty.', 400, 'FULL_NAME_EMPTY');
      }
    }

    const empFk = user.employee_id;

    if (isAttendanceRole(effectiveRole) && empFk && newFullNameRaw !== undefined) {
      await this.employeeRepository.updateFullName(empFk, newFullNameRaw);
    }

    if (isAttendanceRole(prevRole) && effectiveRole === 'admin') {
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

    if (prevRole === 'admin' && isAttendanceRole(effectiveRole)) {
      if (requiresFullName(effectiveRole) && newFullNameRaw === undefined) {
        throw new AppError(
          'full_name is required when changing role to Staff Kantor or Petugas Lapangan.',
          400,
          'EMPLOYEE_FIELDS'
        );
      }
      const fullNameForNewEmployee = newFullNameRaw;
      if (requiresFullName(effectiveRole) && !fullNameForNewEmployee) {
        throw new AppError(
          'full_name is required when changing role to Staff Kantor or Petugas Lapangan.',
          400,
          'EMPLOYEE_FIELDS'
        );
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
                fullName: fullNameForNewEmployee,
                departmentId,
                positionId,
                salaryType: 'monthly',
                basicSalary: 0,
                joinDate: payload.join_date || new Date().toISOString().slice(0, 10),
                birthday: payload.birthday || null,
                status: 'active',
                remoteWorkAllowed: has('remote_work_allowed') ? Boolean(payload.remote_work_allowed) : true,
                dailySegments: CLOCK_SEGMENTS_PER_DAY,
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

        const patch = { role: effectiveRole, employeeId: emp.id, officeId: office };
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
      await syncEmployeeHrFields();
      const updated = stripUserSecrets(await this.userRepository.findById(userId));
      return { ...updated, employee_code: emp.employee_id };
    }

    const patch = {};
    if (newUsername !== undefined) patch.username = newUsername;
    if (newRole !== undefined) patch.role = newRole;
    if (newOfficeIdValue !== undefined) {
      let oid = newOfficeIdValue;
      if (isAttendanceRole(effectiveRole) && !oid) {
        oid = await this.metaRepository.firstOfficeId();
      }
      patch.officeId = isAttendanceRole(effectiveRole) ? oid : newOfficeIdValue;
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
    await syncEmployeeHrFields();
    return stripUserSecrets(await this.userRepository.findById(userId));
  }
}

module.exports = { UserService };
