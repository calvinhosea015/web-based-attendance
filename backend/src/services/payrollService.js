const { AppError } = require('../utils/errors');
const {
  buildEmployeeSlipWorkbook,
  employeeSlipExportFilename,
  slipWorkbookFromRows,
  writeSlipBuffer,
  periodLabel,
} = require('../utils/payrollSlipExport');
const {
  buildFieldTonaseBonusWorkbook,
  writeFieldTonaseBonusBuffer,
  exportFilename: fieldTonaseBonusExportFilename,
} = require('../utils/fieldTonaseBonusExport');
const {
  payrollCycleBounds,
  payrollCycleLabel,
  periodLabelCalendar,
  countWorkingDaysMonSatInCycle,
  listPayrollHolidaysInCycle,
} = require('../utils/payrollPeriod');
const {
  ROLES,
  isAccounting,
  isGeneralAffairs,
  isHeadOfFinance,
  isFieldOfficer,
} = require('../constants/roles');
const {
  hasMonthlyBasicPayroll,
  receivesMonthlyAbsenceDeduction,
  receivesStaffKantorAttendancePayroll,
  normalizeRolePayrollFields,
} = require('../utils/payrollRoleRules');
const { countEffectiveDaysAttended } = require('../utils/leavePayrollDays');
const {
  computeStaffKantorOvertimeMinutes,
  computeLemburPay,
  computeLateDeductionPay,
} = require('../utils/staffKantorOvertime');
const {
  receivesTunjanganMasaKerja,
  resolveTunjanganMasaKerjaForRole,
} = require('../utils/tenureAllowance');
const {
  resolveTransportEligible,
  resolveDiligenceEligible,
  resolveAllowanceRateFields,
} = require('../utils/payrollAllowances');
const { resolveUpahHarian } = require('../utils/payrollUpahHarian');

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

function normalizeRequiredWorkDays(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

/** Gaji = hari kerja × upah harian (Petugas Lapangan / Umum). */
function computeGaji(daysAttended, upahHarian) {
  const days = Math.max(0, Math.floor(num(daysAttended)));
  return days * num(upahHarian);
}

function isMonthlyOfficeStaff(role) {
  return role === ROLES.EMPLOYEE;
}

/** Head of Finance: preserve prior row / profile defaults; admin edits all amounts manually. */
function buildManualPayrollFields({ prev, emp, settings }) {
  const transportEligible = prev?.transport_eligible ?? Boolean(emp.transport_eligible);
  const diligenceEligible = prev?.diligence_eligible ?? false;
  const { transport_allowance_amount: transportAmount, diligence_allowance_amount: diligenceAmount } =
    resolveAllowanceRateFields({
      transportEligible,
      diligenceEligible,
      transportAllowanceStored: prev?.transport_allowance,
      diligenceBonusStored: prev?.diligence_bonus,
      employeeTransportAmount: emp.transport_allowance_amount,
      employeeDiligenceAmount: emp.diligence_allowance_amount,
      settings,
    });
  return {
    basic_salary: num(prev?.basic_salary ?? emp.basic_salary),
    tunjangan_masa_kerja: num(prev?.tunjangan_masa_kerja ?? emp.tunjangan_masa_kerja),
    transport_eligible: transportEligible,
    transport_allowance_amount: transportAmount,
    overtime_pay: num(prev?.overtime_pay ?? 0),
    insentif: num(prev?.insentif ?? 0),
    diligence_eligible: diligenceEligible,
    diligence_allowance_amount: diligenceAmount,
    bonus_omset: num(prev?.bonus_omset ?? 0),
    other_deductions: num(prev?.other_deductions ?? prev?.deductions ?? 0),
    loan_deduction: num(prev?.loan_deduction ?? 0),
    late_deduction: num(prev?.late_deduction ?? 0),
    pph_21: num(prev?.pph_21 ?? 0),
  };
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

/** Merge employee profile fields onto a payroll row for API responses. */
function attachEmployeeFields(payrollRow, employee) {
  if (!employee) return payrollRow;
  return {
    ...payrollRow,
    employee_code: employee.employee_code ?? employee.employee_id ?? payrollRow.employee_code,
    full_name: employee.full_name ?? payrollRow.full_name,
    join_date: employee.join_date ?? payrollRow.join_date,
    user_role: employee.user_role ?? payrollRow.user_role,
    employee_upah_harian: employee.upah_harian ?? payrollRow.employee_upah_harian,
    employee_basic_salary: employee.basic_salary ?? payrollRow.employee_basic_salary,
    employee_tunjangan_masa_kerja:
      employee.tunjangan_masa_kerja ?? payrollRow.employee_tunjangan_masa_kerja,
    employee_transport_eligible:
      employee.transport_eligible ?? payrollRow.employee_transport_eligible,
    employee_transport_allowance_amount:
      employee.transport_allowance_amount ?? payrollRow.employee_transport_allowance_amount,
    employee_diligence_allowance_amount:
      employee.diligence_allowance_amount ?? payrollRow.employee_diligence_allowance_amount,
  };
}

function attachPayrollMode(row) {
  const role = row.user_role;
  if (isHeadOfFinance(role)) {
    return {
      ...row,
      payroll_mode: 'manual',
      absence_deduction: 0,
      days_absent: 0,
      expected_work_days: null,
    };
  }
  if (isAccounting(role)) {
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
    const absenceDeduction =
      row.absence_deduction != null ? num(row.absence_deduction) : calc.absence_deduction;
    return {
      ...row,
      payroll_mode: 'accounting',
      monthly_basic_gross: calc.monthly_basic_gross,
      expected_work_days: calc.expected_work_days,
      days_absent: calc.days_absent,
      absence_deduction: absenceDeduction,
      basic_salary: row.basic_salary != null ? num(row.basic_salary) : calc.basic_salary,
    };
  }
  if (isGeneralAffairs(role)) {
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
    const absenceDeduction =
      row.absence_deduction != null ? num(row.absence_deduction) : calc.absence_deduction;
    return {
      ...row,
      payroll_mode: 'general_affairs',
      monthly_basic_gross: calc.monthly_basic_gross,
      expected_work_days: calc.expected_work_days,
      days_absent: calc.days_absent,
      absence_deduction: absenceDeduction,
      basic_salary: row.basic_salary != null ? num(row.basic_salary) : calc.basic_salary,
    };
  }
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
  const absenceDeduction =
    row.absence_deduction != null ? num(row.absence_deduction) : calc.absence_deduction;
  return {
    ...row,
    payroll_mode,
    monthly_basic_gross: calc.monthly_basic_gross,
    expected_work_days: calc.expected_work_days,
    days_absent: calc.days_absent,
    absence_deduction: absenceDeduction,
    basic_salary: row.basic_salary != null ? num(row.basic_salary) : calc.basic_salary,
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

function computeTotals(fields, employee, settings, role = null) {
  const { transportAmount, diligenceAmount } = resolveAllowanceAmounts(fields, employee, settings);
  const transportAllowance = fields.transport_eligible ? transportAmount : 0;
  const diligenceBonus = fields.diligence_eligible ? diligenceAmount : 0;
  const tunjangan = num(fields.tunjangan_masa_kerja);
  const overtime = num(fields.overtime_pay);
  const insentif = num(fields.insentif);
  const bonusOmset = num(fields.bonus_omset);
  const loanDeduction = num(fields.loan_deduction);
  const lateDeduction = num(fields.late_deduction);
  const pph21 = num(fields.pph_21);
  const otherDeductions = num(fields.other_deductions);
  const bpjsTk = num(fields.bpjs_tk);
  const bpjsKes = num(fields.bpjs_kes);
  const absenceDeduction = num(fields.absence_deduction);
  const monthlyGross = num(fields.monthly_basic_gross);
  const isMonthly = role && receivesMonthlyAbsenceDeduction(role);

  let earningsBase = num(fields.basic_salary);
  let basicSalary = earningsBase;
  if (isMonthly) {
    const gross = monthlyGross > 0 ? monthlyGross : earningsBase + absenceDeduction;
    earningsBase = gross;
    basicSalary = Math.max(0, gross - absenceDeduction);
  }

  const deductions =
    absenceDeduction +
    loanDeduction +
    lateDeduction +
    pph21 +
    otherDeductions +
    bpjsTk +
    bpjsKes;
  const allowances =
    tunjangan + transportAllowance + overtime + insentif + diligenceBonus + bonusOmset;
  const finalSalary = earningsBase + allowances - deductions;
  return {
    transport_allowance: transportAllowance,
    diligence_bonus: diligenceBonus,
    loan_deduction: loanDeduction,
    late_deduction: lateDeduction,
    pph_21: pph21,
    other_deductions: otherDeductions,
    bpjs_tk: bpjsTk,
    bpjs_kes: bpjsKes,
    absence_deduction: absenceDeduction,
    deductions,
    allowances,
    final_salary: finalSalary,
    basic_salary: basicSalary,
    transport_allowance_amount: transportAmount,
    diligence_allowance_amount: diligenceAmount,
  };
}

function withSlipTotalsContext(fields, role, ctx = {}) {
  const isMonthly = role && receivesMonthlyAbsenceDeduction(role);
  return {
    ...fields,
    monthly_basic_gross: isMonthly
      ? num(ctx.monthly_basic_gross ?? fields.monthly_basic_gross ?? ctx.employee_basic_salary)
      : 0,
    absence_deduction: num(ctx.absence_deduction ?? fields.absence_deduction ?? 0),
    bpjs_tk: num(ctx.bpjs_tk ?? fields.bpjs_tk ?? 0),
    bpjs_kes: num(ctx.bpjs_kes ?? fields.bpjs_kes ?? 0),
  };
}

class PayrollService {
  constructor(
    payrollRepository,
    employeeRepository,
    loanRequestRepository,
    leaveRequestRepository,
    attendanceRepository,
    fieldDeliveryRepository = null
  ) {
    this.payrollRepository = payrollRepository;
    this.employeeRepository = employeeRepository;
    this.loanRequestRepository = loanRequestRepository;
    this.leaveRequestRepository = leaveRequestRepository;
    this.attendanceRepository = attendanceRepository;
    this.fieldDeliveryRepository = fieldDeliveryRepository;
  }

  async sumFieldOfficerBonusForPeriod(employeeId, periodStart, periodEnd) {
    if (!this.fieldDeliveryRepository) return 0;
    return this.fieldDeliveryRepository.sumBonusBetween(employeeId, periodStart, periodEnd);
  }

  async sumFieldOfficerOmsetForPeriod(employeeId, periodStart, periodEnd) {
    if (!this.fieldDeliveryRepository) return 0;
    return this.fieldDeliveryRepository.sumOmsetBetween(employeeId, periodStart, periodEnd);
  }

  /** Omset & bonus from petugas lapangan delivery codes for a payroll period. */
  async getFieldOfficerOmsetReport(period) {
    const bounds = parsePeriod(period);
    if (!this.fieldDeliveryRepository) {
      return {
        ...this.periodMeta(bounds.payroll_period),
        period_start: bounds.period_start,
        period_end: bounds.period_end,
        total_omset: 0,
        total_bonus: 0,
        delivery_count: 0,
        employees: [],
      };
    }
    const deliveries = await this.fieldDeliveryRepository.listDeliveriesInPeriod(
      bounds.period_start,
      bounds.period_end
    );
    const byEmployee = new Map();
    for (const row of deliveries) {
      const key = row.employee_id;
      if (!byEmployee.has(key)) {
        byEmployee.set(key, {
          employee_id: row.employee_id,
          full_name: row.full_name,
          employee_code: row.employee_code,
          omset_total: 0,
          bonus_total: 0,
          delivery_count: 0,
          deliveries: [],
        });
      }
      const bucket = byEmployee.get(key);
      const omset = Number(row.omset_amount) || 0;
      const bonus = Number(row.bonus_amount) || 0;
      bucket.omset_total += omset;
      bucket.bonus_total += bonus;
      bucket.delivery_count += 1;
      bucket.deliveries.push({
        id: row.id,
        valid_on: row.valid_on,
        checkout_code: row.checkout_code,
        pabrik_code: row.pabrik_code,
        kode_barang: row.kode_barang,
        norek: row.norek,
        nomor_tanda_terima: row.nomor_tanda_terima,
        nomor_surat_jalan: row.nomor_surat_jalan,
        nopol: row.nopol,
        no_bs: row.no_bs,
        kotor: Number(row.kotor),
        berat_bersih: Number(row.berat_bersih),
        selisih: Number(row.selisih),
        tonase_per_item: Number(row.tonase_per_item),
        omset_amount: omset,
        bonus_amount: bonus,
        created_at: row.created_at,
      });
    }
    const roster = this.employeeRepository
      ? await this.employeeRepository.listActiveFieldOfficers()
      : [];
    const seen = new Set();
    const employees = [];
    for (const officer of roster) {
      seen.add(officer.employee_id);
      const bucket = byEmployee.get(officer.employee_id);
      employees.push(
        bucket
          ? {
              ...bucket,
              omset_total: Math.round(bucket.omset_total * 100) / 100,
              bonus_total: Math.round(bucket.bonus_total * 100) / 100,
            }
          : {
              employee_id: officer.employee_id,
              full_name: officer.full_name,
              employee_code: officer.employee_code,
              omset_total: 0,
              bonus_total: 0,
              delivery_count: 0,
              deliveries: [],
            }
      );
    }
    for (const bucket of byEmployee.values()) {
      if (seen.has(bucket.employee_id)) continue;
      employees.push({
        ...bucket,
        omset_total: Math.round(bucket.omset_total * 100) / 100,
        bonus_total: Math.round(bucket.bonus_total * 100) / 100,
      });
    }
    employees.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
    const total_omset = employees.reduce((s, e) => s + e.omset_total, 0);
    const total_bonus = employees.reduce((s, e) => s + e.bonus_total, 0);
    return {
      ...this.periodMeta(bounds.payroll_period),
      period_start: bounds.period_start,
      period_end: bounds.period_end,
      total_omset: Math.round(total_omset * 100) / 100,
      total_bonus: Math.round(total_bonus * 100) / 100,
      delivery_count: deliveries.length,
      employees,
    };
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
    const settings = await this.payrollRepository.getSettings();
    const employee = row.employee_id
      ? await this.employeeRepository.findById(row.employee_id)
      : null;
    const merged = attachEmployeeFields(
      attachPayrollMode({
        ...row,
        ...enriched,
        payroll_period: period,
        user_role: enriched.user_role ?? row.user_role,
      }),
      employee
        ? { ...employee, employee_code: employee.employee_id, user_role: enriched.user_role ?? row.user_role }
        : null
    );

    const transportEligible = resolveTransportEligible(merged, employee);
    const diligenceEligible = resolveDiligenceEligible(merged);
    const allowanceRates = resolveAllowanceRateFields({
      transportEligible,
      diligenceEligible,
      transportAllowanceStored: merged.transport_allowance,
      diligenceBonusStored: merged.diligence_bonus,
      employeeTransportAmount:
        merged.employee_transport_allowance_amount ?? employee?.transport_allowance_amount,
      employeeDiligenceAmount:
        merged.employee_diligence_allowance_amount ?? employee?.diligence_allowance_amount,
      settings,
    });

    const totals = computeTotals(
      withSlipTotalsContext(
        normalizeRolePayrollFields(
          {
            basic_salary: num(merged.basic_salary),
            tunjangan_masa_kerja: num(merged.tunjangan_masa_kerja),
            transport_eligible: transportEligible,
            diligence_eligible: diligenceEligible,
            transport_allowance_amount: allowanceRates.transport_allowance_amount,
            diligence_allowance_amount: allowanceRates.diligence_allowance_amount,
            overtime_pay: num(merged.overtime_pay),
            insentif: num(merged.insentif),
            bonus_omset: num(merged.bonus_omset),
            loan_deduction: num(merged.loan_deduction),
            late_deduction: num(merged.late_deduction),
            pph_21: num(merged.pph_21),
            other_deductions: num(merged.other_deductions ?? merged.deductions),
            bpjs_tk: num(merged.bpjs_tk),
            bpjs_kes: num(merged.bpjs_kes),
          },
          merged.user_role
        ),
        merged.user_role,
        {
          monthly_basic_gross: merged.monthly_basic_gross,
          absence_deduction: merged.absence_deduction,
          employee_basic_salary: merged.employee_basic_salary,
          bpjs_tk: merged.bpjs_tk,
          bpjs_kes: merged.bpjs_kes,
        }
      ),
      employee,
      settings,
      merged.user_role
    );

    return {
      ...merged,
      transport_eligible: transportEligible,
      diligence_eligible: diligenceEligible,
      transport_allowance: totals.transport_allowance,
      diligence_bonus: totals.diligence_bonus,
      settings_transport_amount: settings.transport_amount,
      settings_diligence_amount: settings.diligence_amount,
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
    let gaji;
    let resolvedUpahHarian = upahHarian;
    let resolvedDays = days;
    if (receivesMonthlyAbsenceDeduction(role)) {
      const expectedDays = this.resolveExpectedWorkDays({
        payrollPeriod,
        existing: prev?.expected_work_days,
      });
      const monthlyCalc = computeMonthlyStaffPayroll({
        monthlyBasic: monthlyBasicGross,
        expectedDays,
        daysAttended: days,
      });
      gaji = monthlyCalc.basic_salary;
      resolvedUpahHarian = 0;
      resolvedDays = monthlyCalc.days_attended;
    } else {
      gaji = computeGaji(days, upahHarian);
    }
    const { transport_allowance_amount: transportAmount, diligence_allowance_amount: diligenceAmount } =
      resolveAllowanceRateFields({
        transportEligible,
        diligenceEligible,
        transportAllowanceStored: prev?.transport_allowance,
        diligenceBonusStored: prev?.diligence_bonus,
        employeeTransportAmount: emp.transport_allowance_amount,
        employeeDiligenceAmount: emp.diligence_allowance_amount,
        settings,
      });

    const joinDate = (employee || emp)?.join_date;
    const tunjanganMasaKerja = resolveTunjanganMasaKerjaForRole(role, joinDate, payrollPeriod);

    return normalizeRolePayrollFields(
      {
        basic_salary: gaji,
        tunjangan_masa_kerja: tunjanganMasaKerja,
        transport_eligible: transportEligible,
        transport_allowance_amount: transportAmount,
        overtime_pay: prev?.overtime_pay ?? 0,
        insentif: prev?.insentif ?? 0,
        diligence_eligible: diligenceEligible,
        diligence_allowance_amount: diligenceAmount,
        bonus_omset: prev?.bonus_omset ?? 0,
        other_deductions: prev?.other_deductions ?? prev?.deductions ?? 0,
        loan_deduction: 0,
        late_deduction: prev?.late_deduction ?? 0,
        pph_21: prev?.pph_21 ?? 0,
        _employee: employee,
        _payrollPeriod: payrollPeriod,
        _prev: prev,
        _resolvedUpahHarian: resolvedUpahHarian,
        _resolvedDays: resolvedDays,
      },
      role
    );
  }

  /** Days attended = check-ins plus approved paid leave workdays (Staff Kantor). */
  async resolveDaysAttended(employeeId, periodStart, periodEnd, role) {
    const monSatOnly = receivesMonthlyAbsenceDeduction(role);
    if (!monSatOnly || !this.leaveRequestRepository) {
      return this.payrollRepository.countDaysAttendedFromAttendance(
        employeeId,
        periodStart,
        periodEnd,
        monSatOnly
      );
    }

    const [attendanceDates, paidLeaves] = await Promise.all([
      this.payrollRepository.listAttendanceDatesInPeriod(
        employeeId,
        periodStart,
        periodEnd,
        true
      ),
      this.leaveRequestRepository.listApprovedPaidInPeriod(employeeId, periodStart, periodEnd),
    ]);

    return countEffectiveDaysAttended({
      periodStart,
      periodEnd,
      attendanceDates,
      paidLeaveRanges: paidLeaves,
      monSatOnly: true,
    });
  }

  resolveExpectedWorkDays({ payrollPeriod, explicit, existing }) {
    const fromExplicit = normalizeRequiredWorkDays(explicit);
    if (fromExplicit != null) return fromExplicit;
    const fromExisting = normalizeRequiredWorkDays(existing);
    if (fromExisting != null) return fromExisting;
    return countWorkingDaysMonSatInCycle(payrollPeriod);
  }

  async sumStaffKantorOvertimeMinutes(employeeId, periodStart, periodEnd) {
    const rows = await this.attendanceRepository.listOvertimeRowsInPeriod(
      employeeId,
      periodStart,
      periodEnd
    );
    let total = 0;
    for (const row of rows) {
      const stored = Number(row.overtime_minutes);
      if (Number.isFinite(stored) && stored > 0) {
        total += Math.floor(stored);
      } else if (row.check_out) {
        total += computeStaffKantorOvertimeMinutes(row.check_out);
      }
    }
    return total;
  }

  /** Lembur = (gaji / required days / 8 / 60) × total overtime minutes in period. */
  async computeLemburPayForPeriod(employeeId, bounds, employee, requiredWorkDays) {
    const minutes = await this.sumStaffKantorOvertimeMinutes(
      employeeId,
      bounds.period_start,
      bounds.period_end
    );
    return computeLemburPay({
      gaji: num(employee.basic_salary),
      requiredWorkDays,
      overtimeMinutes: minutes,
    });
  }

  /** Potongan terlambat = (gaji / required days / 8 / 60) × sum(late_minutes) in period. */
  async computeLateDeductionForPeriod(employeeId, bounds, employee, requiredWorkDays) {
    const lateMinutes = await this.attendanceRepository.sumLateMinutesInPeriod(
      employeeId,
      bounds.period_start,
      bounds.period_end
    );
    return computeLateDeductionPay({
      gaji: num(employee.basic_salary),
      requiredWorkDays,
      lateMinutes,
    });
  }

  /** Refresh days_attended and gaji from attendance; keep other payroll fields. */
  async syncPayrollRowFromAttendance(row, bounds) {
    const empId = row.employee_id;
    let role = row.user_role;
    if (!role) role = await this.payrollRepository.getRoleForEmployee(empId);

    if (isHeadOfFinance(role)) {
      const employee = await this.employeeRepository.findById(empId);
      if (!employee) return row;
      return attachPayrollMode(
        attachEmployeeFields(row, {
          ...employee,
          employee_code: employee.employee_id,
          user_role: role,
        })
      );
    }

    const days = await this.resolveDaysAttended(
      empId,
      bounds.period_start,
      bounds.period_end,
      role
    );
    const employee = await this.employeeRepository.findById(empId);
    if (!employee) return row;

    const settings = await this.payrollRepository.getSettings();
    const upahHarian = resolveUpahHarian(row, employee, role, settings);
    let gaji;

    const expectedDays =
      hasMonthlyBasicPayroll(role) || isFieldOfficer(role)
        ? this.resolveExpectedWorkDays({
            payrollPeriod: bounds.payroll_period,
            existing: row.expected_work_days,
          })
        : null;

    let monthlyCalc = null;
    let absenceForTotals = num(row.absence_deduction);
    if (receivesMonthlyAbsenceDeduction(role) && expectedDays != null) {
      monthlyCalc = computeMonthlyStaffPayroll({
        monthlyBasic: num(employee.basic_salary),
        expectedDays,
        daysAttended: days,
      });
      gaji = monthlyCalc.basic_salary;
      if (row.absence_deduction == null) absenceForTotals = monthlyCalc.absence_deduction;
    } else {
      gaji = computeGaji(days, upahHarian);
      if (
        isFieldOfficer(role) &&
        expectedDays != null &&
        row.absence_deduction == null
      ) {
        absenceForTotals = Math.max(0, expectedDays - days) * upahHarian;
      }
    }

    let overtimePay = num(row.overtime_pay);
    let lateDeduction = num(row.late_deduction);
    if (receivesStaffKantorAttendancePayroll(role) && expectedDays != null) {
      overtimePay = await this.computeLemburPayForPeriod(
        empId,
        bounds,
        employee,
        expectedDays
      );
      lateDeduction = await this.computeLateDeductionForPeriod(
        empId,
        bounds,
        employee,
        expectedDays
      );
    }

    const tunjanganMasaKerja = resolveTunjanganMasaKerjaForRole(
      role,
      employee.join_date,
      bounds.payroll_period
    );

    const transportEligible = resolveTransportEligible(row, employee);
    const diligenceEligible = resolveDiligenceEligible(row);
    const allowanceRates = resolveAllowanceRateFields({
      transportEligible,
      diligenceEligible,
      transportAllowanceStored: row.transport_allowance,
      diligenceBonusStored: row.diligence_bonus,
      employeeTransportAmount: employee.transport_allowance_amount,
      employeeDiligenceAmount: employee.diligence_allowance_amount,
      settings,
    });

    let bonusOmset = num(row.bonus_omset);
    let omsetTotal = num(row.omset_total);
    if (isFieldOfficer(role)) {
      bonusOmset = await this.sumFieldOfficerBonusForPeriod(
        empId,
        bounds.period_start,
        bounds.period_end
      );
      omsetTotal = await this.sumFieldOfficerOmsetForPeriod(
        empId,
        bounds.period_start,
        bounds.period_end
      );
    }

    const fields = normalizeRolePayrollFields(
      {
        basic_salary: gaji,
        tunjangan_masa_kerja: tunjanganMasaKerja,
        transport_eligible: transportEligible,
        transport_allowance_amount: allowanceRates.transport_allowance_amount,
        overtime_pay: overtimePay,
        late_deduction: lateDeduction,
        pph_21: num(row.pph_21),
        insentif: num(row.insentif),
        diligence_eligible: diligenceEligible,
        diligence_allowance_amount: allowanceRates.diligence_allowance_amount,
        bonus_omset: bonusOmset,
        omset_total: omsetTotal,
        other_deductions: Math.max(
          0,
          num(row.other_deductions ?? row.deductions) - num(row.late_deduction)
        ),
        loan_deduction: num(row.loan_deduction),
      },
      role
    );

    const totals = computeTotals(
      withSlipTotalsContext(fields, role, {
        monthly_basic_gross: monthlyCalc?.monthly_basic_gross ?? num(employee.basic_salary),
        absence_deduction: absenceForTotals,
        bpjs_tk: row.bpjs_tk,
        bpjs_kes: row.bpjs_kes,
      }),
      employee,
      settings,
      role
    );
    const saved = await this.payrollRepository.upsertRow({
      employee_id: empId,
      payroll_period: bounds.payroll_period,
      period_start: bounds.period_start,
      period_end: bounds.period_end,
      upah_harian: upahHarian,
      basic_salary: totals.basic_salary ?? gaji,
      days_attended: days,
      expected_work_days: expectedDays,
      tunjangan_masa_kerja: fields.tunjangan_masa_kerja,
      transport_eligible: fields.transport_eligible,
      transport_allowance: totals.transport_allowance,
      overtime_pay: fields.overtime_pay,
      insentif: fields.insentif,
      diligence_eligible: fields.diligence_eligible,
      diligence_bonus: totals.diligence_bonus,
      bonus_omset: fields.bonus_omset,
      omset_total: fields.omset_total ?? omsetTotal,
      loan_deduction: totals.loan_deduction,
      late_deduction: totals.late_deduction,
      pph_21: totals.pph_21,
      other_deductions: totals.other_deductions,
      absence_deduction: totals.absence_deduction,
      bpjs_tk: totals.bpjs_tk,
      bpjs_kes: totals.bpjs_kes,
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
      default_upah_harian:
        payload.default_upah_harian != null ? num(payload.default_upah_harian) : null,
    });
  }

  periodMeta(period, requiredWorkDays = null) {
    const bounds = parsePeriod(period);
    const payroll_period = bounds.payroll_period;
    const required =
      normalizeRequiredWorkDays(requiredWorkDays) ?? countWorkingDaysMonSatInCycle(payroll_period);
    return {
      period: payroll_period,
      period_start: bounds.period_start,
      period_end: bounds.period_end,
      period_label: periodLabelCalendar(payroll_period),
      period_cycle_label: payrollCycleLabel(payroll_period),
      required_work_days: required,
      payroll_holidays: listPayrollHolidaysInCycle(payroll_period),
    };
  }

  async getPeriod(period) {
    const bounds = parsePeriod(period);
    const payrollPeriod = bounds.payroll_period;
    const settings = await this.payrollRepository.getSettings();
    const employees = await this.payrollRepository.listActiveEmployeesForPayroll();
    await this.payrollRepository.deleteForPeriodExceptEmployees(
      payrollPeriod,
      employees.map((e) => e.id)
    );
    const listed = await this.payrollRepository.listByPeriod(payrollPeriod);
    const synced = await Promise.all(
      listed.map((row) => this.syncPayrollRowFromAttendance(row, bounds))
    );
    const persistedRequired = synced.find((row) => row.expected_work_days != null)?.expected_work_days;
    const meta = this.periodMeta(period, persistedRequired);
    const rows = await this.enrichPayrollRows(synced);
    return { ...meta, settings, rows };
  }

  async generatePeriod(period, payload = {}) {
    const bounds = parsePeriod(period);
    const requiredWorkDays = this.resolveExpectedWorkDays({
      payrollPeriod: bounds.payroll_period,
      explicit: payload.required_work_days,
    });
    const settings = await this.payrollRepository.getSettings();
    const employees = await this.payrollRepository.listActiveEmployeesForPayroll();
    const existing = await this.payrollRepository.listByPeriod(bounds.payroll_period);
    const existingByEmp = new Map(existing.map((r) => [r.employee_id, r]));

    const rows = [];
    for (const emp of employees) {
      const role = emp.user_role;
      const prev = existingByEmp.get(emp.id);

      if (isHeadOfFinance(role)) {
        const manualFields = buildManualPayrollFields({ prev, emp, settings });
        const manualFieldsWithSlip = {
          ...manualFields,
          bpjs_tk: num(prev?.bpjs_tk),
          bpjs_kes: num(prev?.bpjs_kes),
        };
        const totals = computeTotals(manualFieldsWithSlip, emp, settings);
        const saved = await this.payrollRepository.upsertRow({
          employee_id: emp.id,
          payroll_period: bounds.payroll_period,
          period_start: bounds.period_start,
          period_end: bounds.period_end,
          upah_harian: 0,
          basic_salary: totals.basic_salary ?? manualFields.basic_salary,
          days_attended: prev?.days_attended ?? 0,
          expected_work_days: null,
          tunjangan_masa_kerja: manualFields.tunjangan_masa_kerja,
          transport_eligible: manualFields.transport_eligible,
          transport_allowance: totals.transport_allowance,
          overtime_pay: manualFields.overtime_pay,
          insentif: manualFields.insentif,
          diligence_eligible: manualFields.diligence_eligible,
          diligence_bonus: totals.diligence_bonus,
          bonus_omset: manualFields.bonus_omset,
          omset_total: num(prev?.omset_total),
          loan_deduction: manualFields.loan_deduction,
          late_deduction: manualFields.late_deduction,
          pph_21: totals.pph_21,
          other_deductions: totals.other_deductions,
          absence_deduction: 0,
          bpjs_tk: totals.bpjs_tk,
          bpjs_kes: totals.bpjs_kes,
          deductions: totals.deductions,
          allowances: totals.allowances,
          final_salary: totals.final_salary,
          keterangan: prev?.keterangan ?? '',
        });
        rows.push(attachEmployeeFields(saved, emp));
        continue;
      }

      const days = await this.resolveDaysAttended(
        emp.id,
        bounds.period_start,
        bounds.period_end,
        role
      );
      const upahHarian = resolveUpahHarian(prev, emp, role, settings);
      const monthlyBasicGross = num(emp.basic_salary);
      let fields = this.buildFieldsFromSources({
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
      const expectedDays =
        hasMonthlyBasicPayroll(role) || isFieldOfficer(role)
          ? this.resolveExpectedWorkDays({
              payrollPeriod: bounds.payroll_period,
              explicit: requiredWorkDays,
              existing: prev?.expected_work_days,
            })
          : null;
      let monthlyCalc = null;
      let absenceForTotals =
        prev?.absence_deduction != null ? num(prev.absence_deduction) : 0;
      if (receivesMonthlyAbsenceDeduction(role) && expectedDays != null) {
        monthlyCalc = computeMonthlyStaffPayroll({
          monthlyBasic: monthlyBasicGross,
          expectedDays,
          daysAttended: fields._resolvedDays ?? days,
        });
        fields.basic_salary = monthlyCalc.basic_salary;
        if (prev?.absence_deduction == null) {
          absenceForTotals = monthlyCalc.absence_deduction;
        }
        if (receivesStaffKantorAttendancePayroll(role)) {
          fields.overtime_pay = await this.computeLemburPayForPeriod(
            emp.id,
            bounds,
            emp,
            expectedDays
          );
          fields.late_deduction = await this.computeLateDeductionForPeriod(
            emp.id,
            bounds,
            emp,
            expectedDays
          );
        }
      }
      fields = normalizeRolePayrollFields(fields, role);
      fields.loan_deduction = await this.resolveLoanDeduction(emp.id, bounds.payroll_period);
      if (isFieldOfficer(role)) {
        fields.bonus_omset = await this.sumFieldOfficerBonusForPeriod(
          emp.id,
          bounds.period_start,
          bounds.period_end
        );
        fields.omset_total = await this.sumFieldOfficerOmsetForPeriod(
          emp.id,
          bounds.period_start,
          bounds.period_end
        );
      }
      if (
        isFieldOfficer(role) &&
        expectedDays != null &&
        prev?.absence_deduction == null
      ) {
        absenceForTotals =
          Math.max(0, expectedDays - (fields._resolvedDays ?? days)) *
          (fields._resolvedUpahHarian ?? upahHarian);
      }

      const totals = computeTotals(
        withSlipTotalsContext(fields, role, {
          monthly_basic_gross: monthlyCalc?.monthly_basic_gross ?? monthlyBasicGross,
          absence_deduction: absenceForTotals,
          bpjs_tk: prev?.bpjs_tk,
          bpjs_kes: prev?.bpjs_kes,
        }),
        emp,
        settings,
        role
      );
      const saved = await this.payrollRepository.upsertRow({
        employee_id: emp.id,
        payroll_period: bounds.payroll_period,
        period_start: bounds.period_start,
        period_end: bounds.period_end,
        upah_harian: fields._resolvedUpahHarian ?? upahHarian,
        basic_salary: totals.basic_salary ?? fields.basic_salary,
        days_attended: fields._resolvedDays ?? days,
        expected_work_days: expectedDays,
        tunjangan_masa_kerja: fields.tunjangan_masa_kerja,
        transport_eligible: fields.transport_eligible,
        transport_allowance: totals.transport_allowance,
        overtime_pay: fields.overtime_pay,
        insentif: fields.insentif,
        diligence_eligible: fields.diligence_eligible,
        diligence_bonus: totals.diligence_bonus,
        bonus_omset: fields.bonus_omset,
        omset_total: isFieldOfficer(role) ? fields.omset_total ?? 0 : 0,
        loan_deduction: totals.loan_deduction,
        late_deduction: totals.late_deduction,
        pph_21: totals.pph_21,
        other_deductions: totals.other_deductions,
        absence_deduction: totals.absence_deduction,
        bpjs_tk: totals.bpjs_tk,
        bpjs_kes: totals.bpjs_kes,
        deductions: totals.deductions,
        allowances: totals.allowances,
        final_salary: totals.final_salary,
        keterangan: prev?.keterangan ?? '',
      });
      rows.push(attachEmployeeFields(saved, emp));
    }
    await this.payrollRepository.deleteForPeriodExceptEmployees(
      bounds.payroll_period,
      employees.map((e) => e.id)
    );
    const enrichedRows = await this.enrichPayrollRows(rows);
    return {
      ...this.periodMeta(bounds.payroll_period, requiredWorkDays),
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
    const headOfFinance = isHeadOfFinance(role);

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
        upah_harian: hasMonthlyBasicPayroll(role) ? 0 : num(employee.upah_harian),
        days_attended: days,
        expected_work_days: hasMonthlyBasicPayroll(role)
          ? this.resolveExpectedWorkDays({ payrollPeriod: bounds.payroll_period })
          : null,
        tunjangan_masa_kerja: resolveTunjanganMasaKerjaForRole(
          role,
          employee.join_date,
          bounds.payroll_period
        ),
        transport_eligible: Boolean(employee.transport_eligible),
        overtime_pay: 0,
        insentif: 0,
        diligence_eligible: false,
        other_deductions: 0,
        loan_deduction: 0,
        pph_21: 0,
      };
    }

    if (headOfFinance) {
      const transportEligible =
        payload.transport_eligible != null
          ? Boolean(payload.transport_eligible)
          : Boolean(existing.transport_eligible);
      const diligenceEligible =
        payload.diligence_eligible != null
          ? Boolean(payload.diligence_eligible)
          : Boolean(existing.diligence_eligible);
      const allowanceRates = resolveAllowanceRateFields({
        transportEligible,
        diligenceEligible,
        transportAllowanceStored:
          payload.transport_allowance_amount != null
            ? payload.transport_allowance_amount
            : existing.transport_allowance,
        diligenceBonusStored:
          payload.diligence_allowance_amount != null
            ? payload.diligence_allowance_amount
            : existing.diligence_bonus,
        employeeTransportAmount: employee.transport_allowance_amount,
        employeeDiligenceAmount: employee.diligence_allowance_amount,
        settings,
      });
      const fields = {
        basic_salary:
          payload.basic_salary != null ? num(payload.basic_salary) : num(existing.basic_salary),
        tunjangan_masa_kerja:
          payload.tunjangan_masa_kerja != null
            ? num(payload.tunjangan_masa_kerja)
            : num(existing.tunjangan_masa_kerja),
        transport_eligible: transportEligible,
        transport_allowance_amount: allowanceRates.transport_allowance_amount,
        overtime_pay:
          payload.overtime_pay != null ? num(payload.overtime_pay) : num(existing.overtime_pay),
        insentif: payload.insentif != null ? num(payload.insentif) : num(existing.insentif),
        diligence_eligible: diligenceEligible,
        diligence_allowance_amount: allowanceRates.diligence_allowance_amount,
        bonus_omset:
          payload.bonus_omset != null ? num(payload.bonus_omset) : num(existing.bonus_omset),
        other_deductions:
          payload.other_deductions != null
            ? num(payload.other_deductions)
            : payload.deductions != null
              ? num(payload.deductions)
              : num(existing.other_deductions ?? existing.deductions),
        loan_deduction:
          payload.loan_deduction != null ? num(payload.loan_deduction) : num(existing.loan_deduction),
        late_deduction:
          payload.late_deduction != null ? num(payload.late_deduction) : num(existing.late_deduction),
        pph_21: payload.pph_21 != null ? num(payload.pph_21) : num(existing.pph_21),
        bpjs_tk: payload.bpjs_tk != null ? num(payload.bpjs_tk) : num(existing.bpjs_tk),
        bpjs_kes: payload.bpjs_kes != null ? num(payload.bpjs_kes) : num(existing.bpjs_kes),
      };
      const totals = computeTotals(fields, employee, settings);
      const keterangan =
        payload.keterangan !== undefined
          ? normalizeKeterangan(payload.keterangan)
          : normalizeKeterangan(existing.keterangan);
      const daysN =
        payload.days_attended != null ? Math.max(0, Math.floor(num(payload.days_attended))) : num(existing.days_attended);
      const saved = await this.payrollRepository.upsertRow({
        employee_id: empId,
        payroll_period: bounds.payroll_period,
        period_start: bounds.period_start,
        period_end: bounds.period_end,
        upah_harian: 0,
        basic_salary: totals.basic_salary ?? fields.basic_salary,
        days_attended: daysN,
        expected_work_days: null,
        tunjangan_masa_kerja: fields.tunjangan_masa_kerja,
        transport_eligible: fields.transport_eligible,
        transport_allowance: totals.transport_allowance,
        overtime_pay: fields.overtime_pay,
        insentif: fields.insentif,
        diligence_eligible: fields.diligence_eligible,
        diligence_bonus: totals.diligence_bonus,
        bonus_omset: fields.bonus_omset,
        omset_total: num(existing.omset_total),
        loan_deduction: fields.loan_deduction,
        late_deduction: fields.late_deduction,
        pph_21: totals.pph_21,
        other_deductions: totals.other_deductions,
        absence_deduction: 0,
        bpjs_tk: totals.bpjs_tk,
        bpjs_kes: totals.bpjs_kes,
        deductions: totals.deductions,
        allowances: totals.allowances,
        final_salary: totals.final_salary,
        keterangan,
      });
      return this.enrichPayrollRow(
        attachEmployeeFields(saved, {
          ...employee,
          employee_code: employee.employee_id,
          user_role: role,
        })
      );
    }

    const upahHarian =
      payload.upah_harian != null
        ? num(payload.upah_harian)
        : resolveUpahHarian(existing, employee, role, settings);
    const daysN =
      payload.days_attended != null
        ? Math.max(0, Math.floor(num(payload.days_attended)))
        : await this.resolveDaysAttended(
            empId,
            bounds.period_start,
            bounds.period_end,
            role
          );
    let gaji;
    let monthlyBasicGross = num(employee.basic_salary);
    let absenceForTotals = 0;
    const expectedDays =
      hasMonthlyBasicPayroll(role) || isFieldOfficer(role)
        ? payload.expected_work_days != null
          ? Math.max(0, Math.floor(num(payload.expected_work_days)))
          : this.resolveExpectedWorkDays({
              payrollPeriod: bounds.payroll_period,
              existing: existing.expected_work_days,
            })
        : null;
    if (receivesMonthlyAbsenceDeduction(role)) {
      if (payload.monthly_basic_gross != null) {
        monthlyBasicGross = num(payload.monthly_basic_gross);
      } else if (payload.basic_salary != null) {
        monthlyBasicGross = num(payload.basic_salary);
      }
      if (payload.absence_deduction != null) {
        absenceForTotals = num(payload.absence_deduction);
      } else {
        absenceForTotals = computeMonthlyStaffPayroll({
          monthlyBasic: monthlyBasicGross,
          expectedDays,
          daysAttended: daysN,
        }).absence_deduction;
      }
      gaji = Math.max(0, monthlyBasicGross - absenceForTotals);
    } else {
      gaji = computeGaji(daysN, upahHarian);
      if (isFieldOfficer(role) && expectedDays != null) {
        if (payload.absence_deduction != null) {
          absenceForTotals = num(payload.absence_deduction);
        } else {
          absenceForTotals = Math.max(0, expectedDays - daysN) * upahHarian;
        }
      }
    }

    const transportEligible =
      payload.transport_eligible != null
        ? Boolean(payload.transport_eligible)
        : resolveTransportEligible(existing, employee);
    const diligenceEligible =
      payload.diligence_eligible != null
        ? Boolean(payload.diligence_eligible)
        : resolveDiligenceEligible(existing);

    const allowanceRates = resolveAllowanceRateFields({
      transportEligible,
      diligenceEligible,
      transportAllowanceStored:
        payload.transport_allowance_amount != null
          ? payload.transport_allowance_amount
          : existing.transport_allowance,
      diligenceBonusStored:
        payload.diligence_allowance_amount != null
          ? payload.diligence_allowance_amount
          : existing.diligence_bonus,
      employeeTransportAmount: employee.transport_allowance_amount,
      employeeDiligenceAmount: employee.diligence_allowance_amount,
      settings,
    });

    let loanDeduction =
      payload.loan_deduction != null ? num(payload.loan_deduction) : null;
    if (loanDeduction == null) {
      loanDeduction = await this.resolveLoanDeduction(empId, bounds.payroll_period);
    }

    const expectedDaysForLate = receivesStaffKantorAttendancePayroll(role)
      ? expectedDays
      : null;

    let lateDeduction =
      payload.late_deduction != null ? num(payload.late_deduction) : num(existing.late_deduction);
    if (
      receivesStaffKantorAttendancePayroll(role) &&
      expectedDaysForLate != null &&
      payload.late_deduction == null
    ) {
      lateDeduction = await this.computeLateDeductionForPeriod(
        empId,
        bounds,
        employee,
        expectedDaysForLate
      );
    }

    let overtimePay =
      payload.overtime_pay != null ? num(payload.overtime_pay) : num(existing.overtime_pay);
    if (
      receivesStaffKantorAttendancePayroll(role) &&
      expectedDaysForLate != null &&
      payload.overtime_pay == null
    ) {
      overtimePay = await this.computeLemburPayForPeriod(
        empId,
        bounds,
        employee,
        expectedDaysForLate
      );
    }

    const fields = normalizeRolePayrollFields(
      {
        basic_salary: gaji,
        tunjangan_masa_kerja:
          payload.tunjangan_masa_kerja != null && receivesTunjanganMasaKerja(role)
            ? num(payload.tunjangan_masa_kerja)
            : resolveTunjanganMasaKerjaForRole(role, employee.join_date, bounds.payroll_period),
        transport_eligible: transportEligible,
        transport_allowance_amount: allowanceRates.transport_allowance_amount,
        overtime_pay: overtimePay,
        insentif: payload.insentif != null ? num(payload.insentif) : num(existing.insentif),
        diligence_eligible: diligenceEligible,
        diligence_allowance_amount: allowanceRates.diligence_allowance_amount,
        bonus_omset: 0,
        other_deductions:
          payload.other_deductions != null
            ? num(payload.other_deductions)
            : payload.deductions != null
              ? num(payload.deductions)
              : Math.max(
                  0,
                  num(existing.other_deductions ?? existing.deductions) -
                    num(existing.late_deduction)
                ),
        loan_deduction: loanDeduction,
        late_deduction: lateDeduction,
        pph_21: payload.pph_21 != null ? num(payload.pph_21) : num(existing.pph_21),
        bpjs_tk: payload.bpjs_tk != null ? num(payload.bpjs_tk) : num(existing.bpjs_tk),
        bpjs_kes: payload.bpjs_kes != null ? num(payload.bpjs_kes) : num(existing.bpjs_kes),
      },
      role
    );

    if (payload.bonus_omset != null) {
      fields.bonus_omset = num(payload.bonus_omset);
    } else if (isFieldOfficer(role)) {
      fields.bonus_omset = await this.sumFieldOfficerBonusForPeriod(
        empId,
        bounds.period_start,
        bounds.period_end
      );
    } else {
      fields.bonus_omset = num(existing.bonus_omset);
    }

    let omsetTotal = num(existing.omset_total);
    if (isFieldOfficer(role)) {
      omsetTotal = await this.sumFieldOfficerOmsetForPeriod(
        empId,
        bounds.period_start,
        bounds.period_end
      );
    }

    const totals = computeTotals(
      withSlipTotalsContext(fields, role, {
        monthly_basic_gross: monthlyBasicGross,
        absence_deduction: absenceForTotals,
        bpjs_tk: fields.bpjs_tk,
        bpjs_kes: fields.bpjs_kes,
      }),
      employee,
      settings,
      role
    );
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
      basic_salary: totals.basic_salary ?? gaji,
      days_attended: daysN,
      expected_work_days: expectedDays,
      tunjangan_masa_kerja: fields.tunjangan_masa_kerja,
      transport_eligible: fields.transport_eligible,
      transport_allowance: totals.transport_allowance,
      overtime_pay: fields.overtime_pay,
      insentif: fields.insentif,
      diligence_eligible: fields.diligence_eligible,
      diligence_bonus: totals.diligence_bonus,
      bonus_omset: fields.bonus_omset,
      omset_total: omsetTotal,
      loan_deduction: totals.loan_deduction,
      late_deduction: totals.late_deduction,
      pph_21: totals.pph_21,
      other_deductions: totals.other_deductions,
      absence_deduction: totals.absence_deduction,
      bpjs_tk: totals.bpjs_tk,
      bpjs_kes: totals.bpjs_kes,
      deductions: totals.deductions,
      allowances: totals.allowances,
      final_salary: totals.final_salary,
      keterangan,
    });

    const defaultsPayload = {};
    if (payload.tunjangan_masa_kerja != null && receivesTunjanganMasaKerja(role)) {
      defaultsPayload.tunjangan_masa_kerja = fields.tunjangan_masa_kerja;
    }
    if (payload.transport_eligible != null) {
      defaultsPayload.transport_eligible = fields.transport_eligible;
    }
    if (isFieldOfficer(role)) {
      defaultsPayload.upah_harian = upahHarian;
    }
    if (
      hasMonthlyBasicPayroll(role) &&
      (payload.monthly_basic_gross != null || payload.basic_salary != null)
    ) {
      defaultsPayload.basic_salary = monthlyBasicGross;
    }
    if (payload.transport_allowance_amount != null) {
      defaultsPayload.transport_allowance_amount =
        allowanceRates.transport_allowance_amount;
    }
    if (payload.diligence_allowance_amount != null) {
      defaultsPayload.diligence_allowance_amount =
        allowanceRates.diligence_allowance_amount;
    }
    if (Object.keys(defaultsPayload).length) {
      await this.employeeRepository.updatePayrollDefaults(empId, defaultsPayload);
    }

    return this.enrichPayrollRow(
      attachEmployeeFields(saved, {
        ...employee,
        employee_code: employee.employee_id,
        user_role: role,
      })
    );
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

  parseExportDateRange(from, to) {
    const dateFrom = String(from ?? '').trim();
    const dateTo = String(to ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      throw new AppError('Invalid date format. Use YYYY-MM-DD.', 400, 'VALIDATION');
    }
    if (dateFrom > dateTo) {
      throw new AppError('Start date must be on or before end date.', 400, 'VALIDATION');
    }
    const start = new Date(`${dateFrom}T00:00:00Z`);
    const end = new Date(`${dateTo}T00:00:00Z`);
    const dayMs = 24 * 60 * 60 * 1000;
    const spanDays = Math.floor((end - start) / dayMs) + 1;
    if (spanDays > 366) {
      throw new AppError('Date range cannot exceed 366 days.', 400, 'VALIDATION');
    }
    return { dateFrom, dateTo };
  }

  /** Excel export: tonase bonus aggregated per factory & item for a custom date range. */
  async exportFieldTonaseBonusReport(from, to) {
    const { dateFrom, dateTo } = this.parseExportDateRange(from, to);
    if (!this.fieldDeliveryRepository) {
      throw new AppError('Field delivery data is not available.', 503, 'UNAVAILABLE');
    }
    const [summaryRows, deliveries] = await Promise.all([
      this.fieldDeliveryRepository.summarizeByFactoryItem(dateFrom, dateTo),
      this.fieldDeliveryRepository.listDeliveriesInPeriod(dateFrom, dateTo),
    ]);
    const wb = await buildFieldTonaseBonusWorkbook({
      summaryRows,
      deliveries,
      dateFrom,
      dateTo,
    });
    const buffer = await writeFieldTonaseBonusBuffer(wb);
    return {
      buffer,
      filename: fieldTonaseBonusExportFilename(dateFrom, dateTo),
      delivery_count: deliveries.length,
      summary_count: summaryRows.length,
    };
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
  computeGaji,
  computeMonthlyStaffPayroll,
  isMonthlyOfficeStaff,
};
