const bcrypt = require('bcryptjs');
const { AppError } = require('../utils/errors');
const { MetaRepository } = require('../repositories/metaRepository');
const { assertPasswordPolicy } = require('../utils/passwordPolicy');
const config = require('../config/env');

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

    let employeeId = null;
    if (role === 'employee') {
      if (!employeeCode || !fullName) {
        throw new AppError('Employees require employee_id and full_name.', 400, 'EMPLOYEE_FIELDS');
      }
      const { departmentId, positionId } = await this.metaRepository.defaultDepartmentAndPosition();
      const emp = await this.employeeRepository.create({
        employeeId: employeeCode,
        fullName,
        departmentId,
        positionId,
        salaryType: payload.salary_type || 'monthly',
        basicSalary: payload.basic_salary ?? 0,
        joinDate: payload.join_date,
        status: 'active',
      });
      employeeId = emp.id;
      const shiftId = await this.metaRepository.firstShiftId();
      if (shiftId) {
        await this.employeeRepository.assignShift(
          employeeId,
          shiftId,
          new Date().toISOString().slice(0, 10)
        );
      }
      await this.employeeRepository.seedDefaultLeaveBalances(employeeId);
    }

    const passwordHash = bcrypt.hashSync(password, config.bcryptRounds);
    const defaultOffice = officeId || (await this.metaRepository.firstOfficeId());

    try {
      return await this.userRepository.create({
        username,
        passwordHash,
        role,
        officeId: role === 'employee' ? defaultOffice : officeId || null,
        employeeId,
      });
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
}

module.exports = { UserService };
