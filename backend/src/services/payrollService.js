const { AppError } = require('../utils/errors');
const {
  buildEmployeeSlipWorkbook,
  employeeSlipExportFilename,
  slipWorkbookFromRows,
  writeSlipBuffer,
  periodLabel,
} = require('../utils/payrollSlipExport');
const {
  payrollCycleBounds,
  payrollCycleLabel,
  periodLabelCalendar,
  countWorkingDaysMonSatInCycle,
  listPayrollHolidaysInCycle,
} = require('../utils/payrollPeriod');
const { ROLES } = require('../constants/roles');

function parsePeriod(period) {
  const bounds = payrollCycleBounds(period);
  if (!bounds) throw new AppError('Invalid payroll period. Use YYYY-MM.', 400, 'PAYROLL_PERIOD');
  return {
    payroll_period: bounds.payroll_period,
    period_start: bounds.period_start,
    period_end: bounds.period_end,
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeKeterangan(value) {
  if (value == null) return '';
  return String(value).trim().slice(0, 500);
}

/** Gaji pokok = hari kerja × upah harian (Petugas Lapangan / Umum). */
function computeGajiPokok(daysAttended, upahHarian) {
  const days = Math.max(0, Math.floor(num(daysAttended)));
  return days * num(upahHarian);
}

function isMonthlyOfficeStaff(role) {
  return role === ROLES.EMPLOYEE;
}

/** Staff Kantor: monthly basic minus absence (Mon–Sat expected days in pay cycle). */
function computeMonthlyStaffPayroll({ monthlyBasic, expectedDays, daysAttended }) {
  const basic = Math.max(0, num(monthlyBasic));
  const expected = Math.max(0, Math.floor(num(expectedDays)));
  const attended = Math.max(0, Math.floor(num(daysAttended)));
  const absent = Math.max(0, expected - attended);
  const perDay = expected > 0 ? basic / expected : 0;
  const absenceDeduction = Math.round(perDay * absent);
  const netBasic = Math.max(0, Math.round(basic) - absenceDeduction);
  return {
    monthly_basic_gross: basic,
    expected_work_days: expected,
    days_attended: attended,
    days_absent: absent,
    absence_deduction: absenceDeduction,
    basic_salary: netBasic,
    upah_harian: 0,
  };
}

function attachPayrollMode(row) {
  const role = row.user_role;
  const payroll_mode = isMonthlyOfficeStaff(role) ? 'monthly' : 'daily';
  if (payroll_mode !== 'monthly') {
    return { ...row, payroll_mode };
  }
  const expected =
    row.expected_work_days != null
      ? row.expected_work_days
      : countWorkingDaysMonSatInCycle(row.payroll_period);
  const monthlyGross =
    row.monthly_basic_gross != null
      ? num(row.monthly_basic_gross)
      : num(row.employee_basic_salary);
  const calc = computeMonthlyStaffPayroll({
    monthlyBasic: monthlyGross,
    expectedDays: expected,
    daysAttended: row.days_attended,
  });
  return {
    ...row,
    payroll_mode,
    monthly_basic_gross: calc.monthly_basic_gross,
    expected_work_days: calc.expected_work_days,
    days_absent: calc.days_absent,
    absence_deduction: calc.absence_deduction,
  };
}

function resolveAllowanceAmounts(fields, employee, settings) {
  const transportAmount =
    fields.transport_allowance_amount != null
      ? num(fields.transport_allowance_amount)
      : num(employee?.transport_allowance_amount ?? settings.transport_amount);
  const diligenceAmount =
    fields.diligence_allowance_amount != null
      ? num(fields.diligence_allowance_amount)
      : num(employee?.diligence_allowance_amount ?? settings.diligence_amount);
  return { transportAmount, diligenceAmount };
}

function computeTotals(fields, employee, settings) {
  const { transportAmount, diligenceAmount } = resolveAllowanceAmounts(fields, employee, settings);
  const transportAllowance = fields.transport_eligible ? transportAmount : 0;
  const diligenceBonus = fields.diligence_eligible ? diligenceAmount : 0;
  const basicSalary = num(fields.basic_salary);
  const tunjangan = num(fields.tunjangan_masa_kerja);
  const overtime = num(fields.overtime_pay);
  const insentif = num(fields.insentif);
  const bonusOmset = num(fields.bonus_omset);
  const loanDeduction = num(fields.loan_deduction);
  const otherDeductions = num(fields.other_deductions);
  const deductions = loanDeduction + otherDeductions;
  const allowances =
    tunjangan + transportAllowance + overtime + insentif + diligenceBonus + bonusOmset;
  const finalSalary = basicSalary + allowances - deductions;
  return {
    transport_allowance: transportAllowance,
    diligence_bonus: diligenceBonus,
    loan_deduction: loanDeduction,
    other_deductions: otherDeductions,
    deductions,
    allowances,
    final_salary: finalSalary,
    transport_allowance_amount: transportAmount,
    diligence_allowance_amount: diligenceAmount,
  };
}

class PayrollService {
  constructor(payrollRepository, employeeRepository, loanRequestRepository) {
    this.payrollRepository = payrollRepository;
    this.employeeRepository = employeeRepository;
    this.loanRequestRepository = loanRequestRepository;
  }

  async previewLoanDeduction(employeeId, payrollPeriod) {
    const activeLoan = await this.loanRequestRepository.findActiveForEmployee(employeeId);
    if (!activeLoan) {
      return { amount: 0, loan: null, alreadyRecorded: false };
    }

    const recorded = await this.loanRequestRepository.findDeductionForPeriod(
      activeLoan.id,
      payrollPeriod
    );
    if (recorded) {
      return {
        amount: num(recorded.amount),
        loan: activeLoan,
        alreadyRecorded: true,
      };
    }

    const remaining = num(activeLoan.remaining_balance ?? activeLoan.loan_amount);
    if (remaining <= 0) {
      return { amount: 0, loan: activeLoan, alreadyRecorded: false };
    }

    const monthly = num(activeLoan.monthly_deduction);
    const amount = Math.min(monthly, remaining);
    return { amount, loan: activeLoan, alreadyRecorded: false };
  }

  async resolveLoanDeduction(employeeId, payrollPeriod) {
    const preview = await this.previewLoanDeduction(employeeId, payrollPeriod);
    if (!preview.loan || preview.amount <= 0 || preview.alreadyRecorded) {
      return preview.amount;
    }
    await this.loanRequestRepository.recordPayrollDeduction({
      loanRequestId: preview.loan.id,
      payrollPeriod,
      amount: preview.amount,
    });
    return preview.amount;
  }

  loanContextFromPreview(preview) {
    if (!preview.loan) {
      return {
        has_active_loan: false,
        loan_monthly_deduction: null,
        loan_remaining_balance: null,
        loan_amount: null,
      };
    }
    return {
      has_active_loan: true,
      loan_monthly_deduction: num(preview.loan.monthly_deduction),
      loan_remaining_balance: num(preview.loan.remaining_balance ?? preview.loan.loan_amount),
      loan_amount: num(preview.loan.loan_amount),
    };
  }

  async enrichPayrollRow(row) {
    let base = row;
    if (!base.user_role && base.employee_id) {
      const role = await this.payrollRepository.getRoleForEmployee(base.employee_id);
      base = { ...base, user_role: role };
    }
    const preview = await this.previewLoanDeduction(base.employee_id, base.payroll_period);
    return attachPayrollMode({
      ...base,
      ...this.loanContextFromPreview(preview),
      loan_deduction_preview: preview.amount,
    });
  }

  async enrichPayrollRows(rows) {
    return Promise.all(rows.map((row) => this.enrichPayrollRow(row)));
  }

  async enrichSlipRow(row, period) {
    const enriched = await this.enrichPayrollRow({ ...row, payroll_period: period });
    return {
      ...row,
      loan_remaining_balance: enriched.loan_remaining_balance,
      loan_monthly_deduction: enriched.loan_monthly_deduction,
      loan_amount: enriched.loan_amount,
      has_active_loan: enriched.has_active_loan,
    };
  }

  async listPayrollForEmployee(employeeId) {
    const rows = await this.payrollRepository.listForEmployee(employeeId);
    const role = await this.payrollRepository.getRoleForEmployee(employeeId);
    const synced = [];
    for (const row of rows) {
      const bounds = parsePeriod(row.payroll_period);
      synced.push(
        await this.syncPayrollRowFromAttendance({ ...row, user_role: role }, bounds)
      );
    }
    return this.enrichPayrollRows(synced);
  }

  buildFieldsFromSources({
    prev,
    emp,
    employee,
    settings,
    days,
    upahHarian,
    payrollPeriod,
    role,
    monthlyBasicGross,
  }) {
    const transportEligible = prev?.transport_eligible ?? Boolean(emp.transport_eligible);
    const diligenceEligible = prev?.diligence_eligible ?? false;
    let gajiPokok;
    let resolvedUpahHarian = upahHarian;
    let resolvedDays = days;
    if (isMonthlyOfficeStaff(role)) {
      const expectedDays = countWorkingDaysMonSatInCycle(payrollPeriod);
      const monthlyCalc = computeMonthlyStaffPayroll({
        monthlyBasic: monthlyBasicGross,
        expectedDays,
        daysAttended: days,
      });
      gajiPokok = monthlyCalc.basic_salary;
      resolvedUpahHarian = 0;
      resolvedDays = monthlyCalc.days_attended;
    } else {
      gajiPokok = computeGajiPokok(days, upahHarian);
    }
    const transportAmount =
      prev?.transport_allowance != null && transportEligible
        ? num(prev.transport_allowance)
        : num(emp.transport_allowance_amount ?? settings.transport_amount);
    const diligenceAmount =
      prev?.diligence_bonus != null && diligenceEligible
        ? num(prev.diligence_bonus)
        : num(emp.diligence_allowance_amount ?? settings.diligence_amount);

    return {
      basic_salary: gajiPokok,
      tunjangan_masa_kerja: prev?.tunjangan_masa_kerja ?? num(emp.tunjangan_masa_kerja),
      transport_eligible: transportEligible,
      transport_allowance_amount: transportAmount,
      overtime_pay: prev?.overtime_pay ?? 0,
      insentif: prev?.insentif ?? 0,
      diligence_eligible: diligenceEligible,
      diligence_allowance_amount: diligenceAmount,
      bonus_omset: prev?.bonus_omset ?? 0,
      other_deductions: prev?.other_deductions ?? prev?.deductions ?? 0,
      loan_deduction: 0,
      _employee: employee,
      _payrollPeriod: payrollPeriod,
      _prev: prev,
      _resolvedUpahHarian: resolvedUpahHarian,
      _resolvedDays: resolvedDays,
    };
  }

  /** Days attended = distinct check-in dates from attendance for the pay period. */
  async resolveDaysAttended(employeeId, periodStart, periodEnd, role) {
    const monSatOnly = isMonthlyOfficeStaff(role);
    return this.payrollRepository.countDaysAttendedFromAttendance(
      employeeId,
      periodStart,
      periodEnd,
      monSatOnly
    );
  }

  /** Refresh days_attended and gaji pokok from attendance; keep other payroll fields. */
  async syncPayrollRowFromAttendance(row, bounds) {
    const empId = row.employee_id;
    let role = row.user_role;
    if (!role) role = await this.payrollRepository.getRoleForEmployee(empId);

    const days = await this.resolveDaysAttended(
      empId,
      bounds.period_start,
      bounds.period_end,
      role
    );
    const employee = await this.employeeRepository.findById(empId);
    if (!employee) return row;

    const settings = await this.payrollRepository.getSettings();
    const monthlyStaff = isMonthlyOfficeStaff(role);
    const upahHarian = monthlyStaff ? 0 : num(row.upah_harian ?? employee.upah_harian);
    let gajiPokok;

    if (monthlyStaff) {
      const expectedDays = countWorkingDaysMonSatInCycle(bounds.payroll_period);
      gajiPokok = computeMonthlyStaffPayroll({
        monthlyBasic: num(employee.basic_salary),
        expectedDays,
        daysAttended: days,
      }).basic_salary;
    } else {
      gajiPokok = computeGajiPokok(days, upahHarian);
    }

    const fields = {
      basic_salary: gajiPokok,
      tunjangan_masa_kerja: num(row.tunjangan_masa_kerja),
      transport_eligible: Boolean(row.transport_eligible),
      transport_allowance_amount: row.transport_eligible
        ? num(row.transport_allowance)
        : num(employee.transport_allowance_amount ?? settings.transport_amount),
      overtime_pay: num(row.overtime_pay),
      insentif: num(row.insentif),
      diligence_eligible: Boolean(row.diligence_eligible),
      diligence_allowance_amount: row.diligence_eligible
        ? num(row.diligence_bonus)
        : num(employee.diligence_allowance_amount ?? settings.diligence_amount),
      bonus_omset: num(row.bonus_omset),
      other_deductions: num(row.other_deductions ?? row.deductions),
      loan_deduction: num(row.loan_deduction),
    };

    const totals = computeTotals(fields, employee, settings);
    const saved = await this.payrollRepository.upsertRow({
      employee_id: empId,
      payroll_period: bounds.payroll_period,
      period_start: bounds.period_start,
      period_end: bounds.period_end,
      upah_harian: upahHarian,
      basic_salary: gajiPokok,
      days_attended: days,
      tunjangan_masa_kerja: fields.tunjangan_masa_kerja,
      transport_eligible: fields.transport_eligible,
      transport_allowance: totals.transport_allowance,
      overtime_pay: fields.overtime_pay,
      insentif: fields.insentif,
      diligence_eligible: fields.diligence_eligible,
      diligence_bonus: totals.diligence_bonus,
      bonus_omset: fields.bonus_omset,
      loan_deduction: totals.loan_deduction,
      other_deductions: totals.other_deductions,
      deductions: totals.deductions,
      allowances: totals.allowances,
      final_salary: totals.final_salary,
      keterangan: row.keterangan ?? '',
    });

    // Keep any join fields from the original row (e.g. full_name/employee_code from listByPeriod)
    // while still refreshing payroll numeric fields from `saved`.
    return { ...row, ...saved, user_role: role };
  }

  async getSettings() {
    return this.payrollRepository.getSettings();
  }

  async updateSettings(payload) {
    return this.payrollRepository.updateSettings({
      transport_amount: payload.transport_amount != null ? num(payload.transport_amount) : null,
      diligence_amount: payload.diligence_amount != null ? num(payload.diligence_amount) : null,
    });
  }

  periodMeta(period) {
    const bounds = parsePeriod(period);
    const payroll_period = bounds.payroll_period;
    return {
      period: payroll_period,
      period_start: bounds.period_start,
      period_end: bounds.period_end,
      period_label: periodLabelCalendar(payroll_period),
      period_cycle_label: payrollCycleLabel(payroll_period),
      required_work_days: countWorkingDaysMonSatInCycle(payroll_period),
      payroll_holidays: listPayrollHolidaysInCycle(payroll_period),
    };
  }

  async getPeriod(period) {
    const bounds = parsePeriod(period);
    const meta = this.periodMeta(period);
    const settings = await this.payrollRepository.getSettings();
    const employees = await this.payrollRepository.listActiveEmployeesForPayroll();
    await this.payrollRepository.deleteForPeriodExceptEmployees(
      meta.period,
      employees.map((e) => e.id)
    );
    const listed = await this.payrollRepository.listByPeriod(meta.period);
    const synced = await Promise.all(
      listed.map((row) => this.syncPayrollRowFromAttendance(row, bounds))
    );
    const rows = await this.enrichPayrollRows(synced);
    return { ...meta, settings, rows };
  }

  async generatePeriod(period) {
    const bounds = parsePeriod(period);
    const settings = await this.payrollRepository.getSettings();
    const employees = await this.payrollRepository.listActiveEmployeesForPayroll();
    const existing = await this.payrollRepository.listByPeriod(bounds.payroll_period);
    const existingByEmp = new Map(existing.map((r) => [r.employee_id, r]));

    const rows = [];
    for (const emp of employees) {
      const role = emp.user_role;
      const days = await this.resolveDaysAttended(
        emp.id,
        bounds.period_start,
        bounds.period_end,
        role
      );
      const prev = existingByEmp.get(emp.id);
      const upahHarian = isMonthlyOfficeStaff(role)
        ? 0
        : prev?.upah_harian != null
          ? num(prev.upah_harian)
          : num(emp.upah_harian);
      const monthlyBasicGross = num(emp.basic_salary);
      const fields = this.buildFieldsFromSources({
        prev,
        emp,
        employee: emp,
        settings,
        days,
        upahHarian,
        payrollPeriod: bounds.payroll_period,
        role,
        monthlyBasicGross,
      });
      fields.loan_deduction = await this.resolveLoanDeduction(emp.id, bounds.payroll_period);

      const totals = computeTotals(fields, emp, settings);
      const saved = await this.payrollRepository.upsertRow({
        employee_id: emp.id,
        payroll_period: bounds.payroll_period,
        period_start: bounds.period_start,
        period_end: bounds.period_end,
        upah_harian: fields._resolvedUpahHarian ?? upahHarian,
        basic_salary: fields.basic_salary,
        days_attended: fields._resolvedDays ?? days,
        tunjangan_masa_kerja: fields.tunjangan_masa_kerja,
        transport_eligible: fields.transport_eligible,
        transport_allowance: totals.transport_allowance,
        overtime_pay: fields.overtime_pay,
        insentif: fields.insentif,
        diligence_eligible: fields.diligence_eligible,
        diligence_bonus: totals.diligence_bonus,
        bonus_omset: fields.bonus_omset,
        loan_deduction: totals.loan_deduction,
        other_deductions: totals.other_deductions,
        deductions: totals.deductions,
        allowances: totals.allowances,
        final_salary: totals.final_salary,
        keterangan: prev?.keterangan ?? '',
      });
      rows.push(saved);
    }
    await this.payrollRepository.deleteForPeriodExceptEmployees(
      bounds.payroll_period,
      employees.map((e) => e.id)
    );
    const enrichedRows = await this.enrichPayrollRows(rows);
    return {
      ...this.periodMeta(bounds.payroll_period),
      settings,
      rows: enrichedRows,
      generated: enrichedRows.length,
    };
  }

  async updateEntry(period, employeeId, payload) {
    const bounds = parsePeriod(period);
    const empId = Number(employeeId);
    if (!Number.isFinite(empId) || empId < 1) {
      throw new AppError('Invalid employee id.', 400, 'VALIDATION');
    }
    const employee = await this.employeeRepository.findById(empId);
    if (!employee) throw new AppError('Employee not found.', 404, 'EMPLOYEE_NOT_FOUND');
    const role =
      (await this.payrollRepository.getRoleForEmployee(empId)) || ROLES.EMPLOYEE;
    const monthlyStaff = isMonthlyOfficeStaff(role);

    const settings = await this.payrollRepository.getSettings();
    let existing = await this.payrollRepository.findByPeriodAndEmployee(bounds.payroll_period, empId);
    if (!existing) {
      const days = await this.resolveDaysAttended(
        empId,
        bounds.period_start,
        bounds.period_end,
        role
      );
      existing = {
        employee_id: empId,
        payroll_period: bounds.payroll_period,
        period_start: bounds.period_start,
        period_end: bounds.period_end,
        upah_harian: monthlyStaff ? 0 : num(employee.upah_harian),
        days_attended: days,
        tunjangan_masa_kerja: num(employee.tunjangan_masa_kerja),
        transport_eligible: Boolean(employee.transport_eligible),
        overtime_pay: 0,
        insentif: 0,
        diligence_eligible: false,
        other_deductions: 0,
        loan_deduction: 0,
      };
    }

    const upahHarian = monthlyStaff
      ? 0
      : payload.upah_harian != null
        ? num(payload.upah_harian)
        : num(existing.upah_harian ?? employee.upah_harian);
    const daysN = await this.resolveDaysAttended(
      empId,
      bounds.period_start,
      bounds.period_end,
      role
    );
    let gajiPokok;
    let monthlyBasicGross = num(employee.basic_salary);
    if (monthlyStaff) {
      if (payload.monthly_basic_gross != null) {
        monthlyBasicGross = num(payload.monthly_basic_gross);
      } else if (payload.basic_salary != null) {
        monthlyBasicGross = num(payload.basic_salary);
      }
      const expectedDays = countWorkingDaysMonSatInCycle(bounds.payroll_period);
      gajiPokok = computeMonthlyStaffPayroll({
        monthlyBasic: monthlyBasicGross,
        expectedDays,
        daysAttended: daysN,
      }).basic_salary;
    } else {
      gajiPokok = computeGajiPokok(daysN, upahHarian);
    }

    const transportEligible =
      payload.transport_eligible != null
        ? Boolean(payload.transport_eligible)
        : Boolean(existing.transport_eligible);
    const diligenceEligible =
      payload.diligence_eligible != null
        ? Boolean(payload.diligence_eligible)
        : Boolean(existing.diligence_eligible);

    const transportAmount =
      payload.transport_allowance_amount != null
        ? num(payload.transport_allowance_amount)
        : transportEligible
          ? num(existing.transport_allowance ?? employee.transport_allowance_amount ?? settings.transport_amount)
          : num(employee.transport_allowance_amount ?? settings.transport_amount);
    const diligenceAmount =
      payload.diligence_allowance_amount != null
        ? num(payload.diligence_allowance_amount)
        : diligenceEligible
          ? num(existing.diligence_bonus ?? employee.diligence_allowance_amount ?? settings.diligence_amount)
          : num(employee.diligence_allowance_amount ?? settings.diligence_amount);

    let loanDeduction =
      payload.loan_deduction != null ? num(payload.loan_deduction) : null;
    if (loanDeduction == null) {
      loanDeduction = await this.resolveLoanDeduction(empId, bounds.payroll_period);
    }

    const fields = {
      basic_salary: gajiPokok,
      tunjangan_masa_kerja:
        payload.tunjangan_masa_kerja != null
          ? num(payload.tunjangan_masa_kerja)
          : num(existing.tunjangan_masa_kerja),
      transport_eligible: transportEligible,
      transport_allowance_amount: transportAmount,
      overtime_pay:
        payload.overtime_pay != null ? num(payload.overtime_pay) : num(existing.overtime_pay),
      insentif: payload.insentif != null ? num(payload.insentif) : num(existing.insentif),
      diligence_eligible: diligenceEligible,
      diligence_allowance_amount: diligenceAmount,
      bonus_omset: payload.bonus_omset != null ? num(payload.bonus_omset) : num(existing.bonus_omset),
      other_deductions:
        payload.other_deductions != null
          ? num(payload.other_deductions)
          : payload.deductions != null
            ? num(payload.deductions)
            : num(existing.other_deductions ?? existing.deductions),
      loan_deduction: loanDeduction,
    };

    const totals = computeTotals(fields, employee, settings);
    const keterangan =
      payload.keterangan !== undefined
        ? normalizeKeterangan(payload.keterangan)
        : normalizeKeterangan(existing.keterangan);
    const saved = await this.payrollRepository.upsertRow({
      employee_id: empId,
      payroll_period: bounds.payroll_period,
      period_start: bounds.period_start,
      period_end: bounds.period_end,
      upah_harian: upahHarian,
      basic_salary: gajiPokok,
      days_attended: daysN,
      tunjangan_masa_kerja: fields.tunjangan_masa_kerja,
      transport_eligible: fields.transport_eligible,
      transport_allowance: totals.transport_allowance,
      overtime_pay: fields.overtime_pay,
      insentif: fields.insentif,
      diligence_eligible: fields.diligence_eligible,
      diligence_bonus: totals.diligence_bonus,
      bonus_omset: fields.bonus_omset,
      loan_deduction: totals.loan_deduction,
      other_deductions: totals.other_deductions,
      deductions: totals.deductions,
      allowances: totals.allowances,
      final_salary: totals.final_salary,
      keterangan,
    });

    const defaultsPayload = {};
    if (payload.tunjangan_masa_kerja != null) {
      defaultsPayload.tunjangan_masa_kerja = fields.tunjangan_masa_kerja;
    }
    if (payload.transport_eligible != null) {
      defaultsPayload.transport_eligible = fields.transport_eligible;
    }
    if (payload.upah_harian != null) defaultsPayload.upah_harian = upahHarian;
    if (monthlyStaff && (payload.monthly_basic_gross != null || payload.basic_salary != null)) {
      defaultsPayload.basic_salary = monthlyBasicGross;
    }
    if (payload.transport_allowance_amount != null) {
      defaultsPayload.transport_allowance_amount = transportAmount;
    }
    if (payload.diligence_allowance_amount != null) {
      defaultsPayload.diligence_allowance_amount = diligenceAmount;
    }
    if (Object.keys(defaultsPayload).length) {
      await this.employeeRepository.updatePayrollDefaults(empId, defaultsPayload);
    }

    return this.enrichPayrollRow(saved);
  }

  async updateEmployeeDefaults(employeeId, payload) {
    const empId = Number(employeeId);
    const row = await this.employeeRepository.updatePayrollDefaults(empId, payload);
    if (!row) throw new AppError('Employee not found.', 404, 'EMPLOYEE_NOT_FOUND');
    return row;
  }

  async getSlipRow(period, employeeId) {
    const bounds = parsePeriod(period);
    const empId = Number(employeeId);
    if (!Number.isFinite(empId) || empId < 1) {
      throw new AppError('Invalid employee id.', 400, 'VALIDATION');
    }
    let row = await this.payrollRepository.findByPeriodAndEmployee(bounds.payroll_period, empId);
    if (!row) {
      throw new AppError(
        'No payroll record for this employee in this period. Generate payroll first.',
        404,
        'PAYROLL_NOT_FOUND'
      );
    }
    const role = await this.payrollRepository.getRoleForEmployee(empId);
    row = await this.syncPayrollRowFromAttendance({ ...row, user_role: role }, bounds);
    return { period: bounds.payroll_period, row };
  }

  async exportEmployeeSlip(period, employeeId) {
    const { period: payroll_period, row } = await this.getSlipRow(period, employeeId);
    const slipRow = await this.enrichSlipRow(row, payroll_period);
    const wb = buildEmployeeSlipWorkbook(slipRow, payroll_period);
    const buffer = await writeSlipBuffer(wb);
    const filename = employeeSlipExportFilename(row);
    return { buffer, filename };
  }

  async exportAllSlips(period) {
    const bounds = parsePeriod(period);
    const listed = await this.payrollRepository.listByPeriod(bounds.payroll_period);
    if (!listed.length) {
      throw new AppError(
        'No payroll records for this period. Generate payroll first.',
        404,
        'PAYROLL_NOT_FOUND'
      );
    }
    const rows = await Promise.all(
      listed.map((row) => this.syncPayrollRowFromAttendance(row, bounds))
    );
    const slipRows = await Promise.all(
      rows.map((row) => this.enrichSlipRow(row, bounds.payroll_period))
    );
    const wb = slipWorkbookFromRows(slipRows, bounds.payroll_period);
    const buffer = await writeSlipBuffer(wb);
    const label = periodLabel(bounds.payroll_period).replace(/\s+/g, '_');
    const filename = `slip_gaji_semua_${bounds.payroll_period.replace('-', '')}.xlsx`;
    return { buffer, filename, count: rows.length, label };
  }
}

module.exports = {
  PayrollService,
  parsePeriod,
  computeTotals,
  computeGajiPokok,
  computeMonthlyStaffPayroll,
  isMonthlyOfficeStaff,
};
