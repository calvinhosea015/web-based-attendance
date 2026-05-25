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
} = require('../utils/payrollPeriod');

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

/** Gaji pokok = hari kerja × upah harian */
function computeGajiPokok(daysAttended, upahHarian) {
  const days = Math.max(0, Math.floor(num(daysAttended)));
  return days * num(upahHarian);
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
    const preview = await this.previewLoanDeduction(row.employee_id, row.payroll_period);
    return {
      ...row,
      ...this.loanContextFromPreview(preview),
      loan_deduction_preview: preview.amount,
    };
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
    return this.enrichPayrollRows(rows);
  }

  buildFieldsFromSources({ prev, emp, employee, settings, days, upahHarian, payrollPeriod }) {
    const transportEligible = prev?.transport_eligible ?? Boolean(emp.transport_eligible);
    const diligenceEligible = prev?.diligence_eligible ?? false;
    const gajiPokok = computeGajiPokok(days, upahHarian);
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
    };
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
    return {
      period: bounds.payroll_period,
      period_start: bounds.period_start,
      period_end: bounds.period_end,
      period_label: periodLabelCalendar(bounds.payroll_period),
      period_cycle_label: payrollCycleLabel(bounds.payroll_period),
    };
  }

  async getPeriod(period) {
    const meta = this.periodMeta(period);
    const settings = await this.payrollRepository.getSettings();
    const employees = await this.payrollRepository.listActiveEmployeesForPayroll();
    await this.payrollRepository.deleteForPeriodExceptEmployees(
      meta.period,
      employees.map((e) => e.id)
    );
    const rows = await this.enrichPayrollRows(
      await this.payrollRepository.listByPeriod(meta.period)
    );
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
      const days = await this.payrollRepository.countDaysAttended(
        emp.id,
        bounds.period_start,
        bounds.period_end
      );
      const prev = existingByEmp.get(emp.id);
      const upahHarian = prev?.upah_harian != null ? num(prev.upah_harian) : num(emp.upah_harian);
      const fields = this.buildFieldsFromSources({
        prev,
        emp,
        employee: emp,
        settings,
        days,
        upahHarian,
        payrollPeriod: bounds.payroll_period,
      });
      fields.loan_deduction = await this.resolveLoanDeduction(emp.id, bounds.payroll_period);

      const totals = computeTotals(fields, emp, settings);
      const saved = await this.payrollRepository.upsertRow({
        employee_id: emp.id,
        payroll_period: bounds.payroll_period,
        period_start: bounds.period_start,
        period_end: bounds.period_end,
        upah_harian: upahHarian,
        basic_salary: fields.basic_salary,
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

    const settings = await this.payrollRepository.getSettings();
    let existing = await this.payrollRepository.findByPeriodAndEmployee(bounds.payroll_period, empId);
    if (!existing) {
      const days = await this.payrollRepository.countDaysAttended(
        empId,
        bounds.period_start,
        bounds.period_end
      );
      existing = {
        employee_id: empId,
        payroll_period: bounds.payroll_period,
        period_start: bounds.period_start,
        period_end: bounds.period_end,
        upah_harian: num(employee.upah_harian),
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

    const upahHarian =
      payload.upah_harian != null
        ? num(payload.upah_harian)
        : num(existing.upah_harian ?? employee.upah_harian);
    const days =
      payload.days_attended != null ? Number(payload.days_attended) : Number(existing.days_attended);
    const daysN = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
    const gajiPokok = computeGajiPokok(daysN, upahHarian);

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
    const { payroll_period } = parsePeriod(period);
    const empId = Number(employeeId);
    if (!Number.isFinite(empId) || empId < 1) {
      throw new AppError('Invalid employee id.', 400, 'VALIDATION');
    }
    const row = await this.payrollRepository.findByPeriodAndEmployee(payroll_period, empId);
    if (!row) {
      throw new AppError(
        'No payroll record for this employee in this period. Generate payroll first.',
        404,
        'PAYROLL_NOT_FOUND'
      );
    }
    return { period: payroll_period, row };
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
    const { payroll_period } = parsePeriod(period);
    const rows = await this.payrollRepository.listByPeriod(payroll_period);
    if (!rows.length) {
      throw new AppError(
        'No payroll records for this period. Generate payroll first.',
        404,
        'PAYROLL_NOT_FOUND'
      );
    }
    const slipRows = await Promise.all(
      rows.map((row) => this.enrichSlipRow(row, payroll_period))
    );
    const wb = slipWorkbookFromRows(slipRows, payroll_period);
    const buffer = await writeSlipBuffer(wb);
    const label = periodLabel(payroll_period).replace(/\s+/g, '_');
    const filename = `slip_gaji_semua_${payroll_period.replace('-', '')}.xlsx`;
    return { buffer, filename, count: rows.length, label };
  }
}

module.exports = { PayrollService, parsePeriod, computeTotals, computeGajiPokok };
