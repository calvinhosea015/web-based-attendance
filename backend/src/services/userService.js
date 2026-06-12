const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');
const { AppError } = require('../utils/errors');
const { MetaRepository } = require('../repositories/metaRepository');
const { assertPasswordPolicy } = require('../utils/passwordPolicy');
const config = require('../config/env');
const {
  ROLES,
  isValidRole,
  isAttendanceRole,
  requiresFullName,
  requiresLinkedEmployee,
  isAccounting,
  isGeneralAffairs,
  isHeadOfFinance,
  usesMultipleOffices,
} = require('../constants/roles');
const { normalizeOfficeIdList } = require('../utils/employeeOffices');
const { normalizePabrikIdList } = require('../utils/employeePabriks');
const { validateCustomWorkHours } = require('../utils/customWorkShift');
const { CLOCK_SEGMENTS_PER_DAY } = require('../constants/attendance');

function stripUserSecrets(row) {
  if (!row) return null;
  const { password_hash: _p, ...rest } = row;
  return rest;
}

class UserService {
  constructor(
    userRepository,
    employeeRepository,
    employeeOfficeRepository = null,
    employeePabrikRepository = null
  ) {
    this.userRepository = userRepository;
    this.employeeRepository = employeeRepository;
    this.employeeOfficeRepository = employeeOfficeRepository;
    this.employeePabrikRepository = employeePabrikRepository;
    this.metaRepository = new MetaRepository();
  }

  async syncFieldOfficerOffices(employeeId, role, officeId, officeIds) {
    if (!usesMultipleOffices(role) || !employeeId || !this.employeeOfficeRepository) return;
    const ids = normalizeOfficeIdList(officeIds, officeId);
    if (ids.length < 1) {
      throw new AppError(
        'Field officers need at least one assigned work location (office_ids).',
        400,
        'OFFICE_REQUIRED'
      );
    }
    await this.employeeOfficeRepository.setOffices(employeeId, ids);
  }

  async syncFieldOfficerPabriks(employeeId, role, pabrikIds) {
    if (!usesMultipleOffices(role) || !employeeId || !this.employeePabrikRepository) return;
    const ids = normalizePabrikIdList(pabrikIds);
    await this.employeePabrikRepository.setPabriks(employeeId, ids);
  }

  resolveOfficeIdForUser(role, officeId, officeIds) {
    const ids = normalizeOfficeIdList(officeIds, officeId);
    if (usesMultipleOffices(role)) {
      if (ids.length < 1) return null;
      return ids[0];
    }
    return officeId;
  }

  async list() {
    const rows = await this.userRepository.listSummary();
    const fieldEmpIds = rows
      .filter((r) => usesMultipleOffices(r.role) && r.employee_id != null)
      .map((r) => Number(r.employee_id));

    const officeMap = this.employeeOfficeRepository
      ? await this.employeeOfficeRepository.mapOfficeIdsByEmployees(fieldEmpIds)
      : new Map();
    const pabrikMap = this.employeePabrikRepository
      ? await this.employeePabrikRepository.mapPabrikIdsByEmployees(fieldEmpIds)
      : new Map();

    return rows.map((row) => {
      if (!usesMultipleOffices(row.role) || row.employee_id == null) return row;
      const empId = Number(row.employee_id);
      const office_ids = officeMap.get(empId) || [];
      const pabrik_ids = pabrikMap.get(empId) || [];
      return {
        ...row,
        office_ids: office_ids.length ? office_ids : row.office_id != null ? [Number(row.office_id)] : [],
        pabrik_ids,
      };
    });
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
    const officeIds = normalizeOfficeIdList(payload.office_ids, officeId);
    const resolvedOfficeId = this.resolveOfficeIdForUser(role, officeId, officeIds);
    if (isAttendanceRole(role) && !resolvedOfficeId) {
      throw new AppError(
        usesMultipleOffices(role)
          ? 'Field officers require at least one assigned work location (office_ids).'
          : 'Employees require an assigned office (office_id).',
        400,
        'OFFICE_REQUIRED'
      );
    }

    const has = (k) => Object.prototype.hasOwnProperty.call(payload, k);
    const remoteWorkAllowed = has('remote_work_allowed') ? Boolean(payload.remote_work_allowed) : true;

    let employeeId = null;
    let createdEmployee = null;
    if (requiresLinkedEmployee(role)) {
      const trimmedFullName = fullName && String(fullName).trim();
      if (requiresFullName(role) && !trimmedFullName) {
        throw new AppError(
          'full_name is required for this role.',
          400,
          'EMPLOYEE_FIELDS'
        );
      }
      let customWorkStart;
      let customWorkEnd;
      if (isAccounting(role)) {
        const hours = validateCustomWorkHours(
          payload.custom_work_start,
          payload.custom_work_end
        );
        if (!hours.ok) {
          throw new AppError(hours.message, 400, 'CUSTOM_WORK_HOURS_REQUIRED');
        }
        customWorkStart = hours.start;
        customWorkEnd = hours.end;
      }
      const resolvedFullName = trimmedFullName;
      const trimmedCode = employeeCode && String(employeeCode).trim();
      const { departmentId, positionId } = await this.metaRepository.defaultDepartmentAndPosition();
      const empPayload = {
        fullName: resolvedFullName,
        departmentId,
        positionId,
        salaryType: payload.salary_type || 'monthly',
        basicSalary:
          isAccounting(role) ||
          isGeneralAffairs(role) ||
          isHeadOfFinance(role) ||
          role === ROLES.EMPLOYEE
            ? Math.max(0, Number(payload.basic_salary) || 0)
            : payload.basic_salary ?? 0,
        upahHarian:
          role === ROLES.EMPLOYEE ||
          isAccounting(role) ||
          isGeneralAffairs(role) ||
          isHeadOfFinance(role)
            ? 0
            : payload.upah_harian ?? 0,
        joinDate: payload.join_date,
        birthday: payload.birthday || null,
        status: 'active',
        remoteWorkAllowed,
        dailySegments: CLOCK_SEGMENTS_PER_DAY,
        custom_work_start: customWorkStart,
        custom_work_end: customWorkEnd,
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
      if (isAttendanceRole(role)) {
        await this.employeeRepository.assignDefaultShiftIfMissing(emp.id);
      }
    }

    const passwordHash = bcrypt.hashSync(password, config.bcryptRounds);

    try {
      const userRow = await this.userRepository.create({
        username,
        passwordHash,
        role,
        officeId: isAttendanceRole(role) ? resolvedOfficeId : officeId || null,
        employeeId,
      });
      if (employeeId) {
        await this.syncFieldOfficerOffices(employeeId, role, resolvedOfficeId, officeIds);
        if (usesMultipleOffices(role) && Object.prototype.hasOwnProperty.call(payload, 'pabrik_ids')) {
          await this.syncFieldOfficerPabriks(employeeId, role, payload.pabrik_ids);
        }
      }
      if (createdEmployee) {
        const office_ids =
          usesMultipleOffices(role) && this.employeeOfficeRepository
            ? await this.employeeOfficeRepository.listOfficeIdsByEmployee(employeeId)
            : undefined;
        const pabrik_ids =
          usesMultipleOffices(role) && this.employeePabrikRepository
            ? await this.employeePabrikRepository.listPabrikIdsByEmployee(employeeId)
            : undefined;
        return {
          ...userRow,
          employee_code: createdEmployee.employee_id,
          ...(office_ids ? { office_ids } : {}),
          ...(pabrik_ids ? { pabrik_ids } : {}),
        };
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
      'custom_work_start',
      'custom_work_end',
      'basic_salary',
      'office_ids',
      'pabrik_ids',
    ];
    if (!allowedKeys.some((k) => has(k))) {
      throw new AppError(
        'At least one of username, role, office_id, full_name, remote_work_allowed, join_date, birthday, custom work hours, or basic_salary is required.',
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
      if (
        isAccounting(effectiveRole) &&
        (has('custom_work_start') || has('custom_work_end'))
      ) {
        const hours = validateCustomWorkHours(
          has('custom_work_start') ? payload.custom_work_start : latest.custom_work_start,
          has('custom_work_end') ? payload.custom_work_end : latest.custom_work_end
        );
        if (!hours.ok) {
          throw new AppError(hours.message, 400, 'CUSTOM_WORK_HOURS_REQUIRED');
        }
        patch.custom_work_start = hours.start;
        patch.custom_work_end = hours.end;
      }
      if (Object.keys(patch).length) {
        await this.employeeRepository.updateEnterpriseFields(latest.employee_id, patch);
      }
      if (
        has('basic_salary') &&
        (isAccounting(effectiveRole) ||
          isGeneralAffairs(effectiveRole) ||
          isHeadOfFinance(effectiveRole))
      ) {
        await this.employeeRepository.updatePayrollDefaults(latest.employee_id, {
          basic_salary: Math.max(0, Number(payload.basic_salary) || 0),
        });
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

    let newOfficeIdsValue;
    if (has('office_ids')) {
      newOfficeIdsValue = normalizeOfficeIdList(payload.office_ids, newOfficeIdValue);
      if (usesMultipleOffices(effectiveRole) && newOfficeIdsValue.length < 1) {
        throw new AppError(
          'Field officers need at least one assigned work location.',
          400,
          'OFFICE_REQUIRED'
        );
      }
      if (usesMultipleOffices(effectiveRole) && newOfficeIdsValue.length) {
        newOfficeIdValue = newOfficeIdsValue[0];
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

    if (requiresLinkedEmployee(effectiveRole) && empFk && newFullNameRaw !== undefined) {
      await this.employeeRepository.updateFullName(empFk, newFullNameRaw);
    }

    if (requiresLinkedEmployee(prevRole) && effectiveRole === 'admin') {
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

    if (prevRole === 'admin' && requiresLinkedEmployee(effectiveRole)) {
      if (requiresFullName(effectiveRole) && newFullNameRaw === undefined) {
        throw new AppError('full_name is required for this role.', 400, 'EMPLOYEE_FIELDS');
      }
      const fullNameForNewEmployee = newFullNameRaw;
      if (requiresFullName(effectiveRole) && !fullNameForNewEmployee) {
        throw new AppError('full_name is required for this role.', 400, 'EMPLOYEE_FIELDS');
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
        let office = null;
        if (isAttendanceRole(effectiveRole)) {
          office =
            newOfficeIdValue !== undefined
              ? newOfficeIdValue
              : (await this.metaRepository.firstOfficeId());
          if (!office) throw new AppError('No office configured; create an office first.', 400);
        }

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

      if (isAttendanceRole(effectiveRole)) {
        await this.employeeRepository.assignDefaultShiftIfMissing(emp.id);
      }
      await this.syncFieldOfficerOffices(
        emp.id,
        effectiveRole,
        office,
        has('office_ids') ? newOfficeIdsValue : normalizeOfficeIdList(payload.office_ids, office)
      );
      if (has('pabrik_ids')) {
        await this.syncFieldOfficerPabriks(emp.id, effectiveRole, payload.pabrik_ids);
      }
      await syncEmployeePolicies();
      await syncEmployeeHrFields();
      const updated = stripUserSecrets(await this.userRepository.findById(userId));
      const pabrik_ids =
        usesMultipleOffices(effectiveRole) && this.employeePabrikRepository
          ? await this.employeePabrikRepository.listPabrikIdsByEmployee(emp.id)
          : undefined;
      return {
        ...updated,
        employee_code: emp.employee_id,
        ...(pabrik_ids ? { pabrik_ids } : {}),
      };
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

    if (empFk) {
      if (usesMultipleOffices(prevRole) && !usesMultipleOffices(effectiveRole)) {
        if (this.employeeOfficeRepository) {
          await this.employeeOfficeRepository.setOffices(empFk, []);
        }
        if (this.employeePabrikRepository) {
          await this.employeePabrikRepository.setPabriks(empFk, []);
        }
      } else if (usesMultipleOffices(effectiveRole) && (has('office_ids') || has('office_id'))) {
        await this.syncFieldOfficerOffices(
          empFk,
          effectiveRole,
          newOfficeIdValue !== undefined ? newOfficeIdValue : user.office_id,
          has('office_ids') ? newOfficeIdsValue : undefined
        );
      }
      if (usesMultipleOffices(effectiveRole) && has('pabrik_ids')) {
        await this.syncFieldOfficerPabriks(empFk, effectiveRole, payload.pabrik_ids);
      }
    }

    const updated = stripUserSecrets(await this.userRepository.findById(userId));
    if (empFk && usesMultipleOffices(effectiveRole)) {
      const extra = {};
      if (this.employeeOfficeRepository) {
        extra.office_ids = await this.employeeOfficeRepository.listOfficeIdsByEmployee(empFk);
      }
      if (this.employeePabrikRepository) {
        extra.pabrik_ids = await this.employeePabrikRepository.listPabrikIdsByEmployee(empFk);
      }
      return { ...updated, ...extra };
    }
    return updated;
  }
}

module.exports = { UserService };
