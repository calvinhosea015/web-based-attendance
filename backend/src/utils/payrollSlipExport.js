const ExcelJS = require('exceljs');
const {
  periodLabelCalendar,
  countWorkingDaysMonSatInCycle,
  cycleEndDate,
} = require('./payrollPeriod');
const { usesDailyWagePayroll } = require('../constants/roles');
const {
  resolveTransportEligible,
  resolveDiligenceEligible,
  resolvePayrollAllowanceAmounts,
} = require('./payrollAllowances');

const EARNINGS = [
  { key: 'gaji', label: 'Gaji' },
  { key: 'tunjangan_masa_kerja', label: 'Tunjangan Masa Kerja' },
  { key: 'tunjangan_transport', label: 'Tunjangan Transport' },
  { key: 'lembur', label: 'Lembur' },
  { key: 'insentif', label: 'Insentif' },
  { key: 'kerajinan', label: 'Kerajinan' },
  { key: 'bonus', label: 'Bonus' },
];

const DEDUCTIONS = [
  { key: 'potongan_absen', label: 'Potongan Absen' },
  { key: 'potongan_terlambat', label: 'Potongan Datang Terlambat' },
  { key: 'bpjs_tk', label: 'BPJS Ketenagakerjaan' },
  { key: 'bpjs_kes', label: 'BPJS Kesehatan' },
  { key: 'pph21', label: 'PPh 21' },
  { key: 'kasbon', label: 'Kasbon' },
  { key: 'potongan_lain', label: 'Potongan lain' },
];

const COL = { A: 1, B: 2, C: 3, D: 4 };

const ROW = {
  NAMA: 1,
  JABATAN: 3,
  PERIODE: 4,
  TABLE_HEAD: 6,
  TABLE_FIRST: 7,
  TABLE_LAST: 13,
  TABLE_TOTAL: 14,
  JUMLAH_HARI: 16,
  JUMLAH_HADIR: 17,
  KETERANGAN_START: 17,
  KETERANGAN_END: 18,
  SIGN_TITLE: 19,
  NET_LABEL_START: 19,
  NET_LABEL_END: 20,
  NET_AMOUNT_START: 21,
  NET_AMOUNT_END: 22,
  SIGN_LINE: 22,
};

const BASE_SHEET_LAST_ROW = 22;
const FIELD_OFFICER_SECTION_LAST_ROW = 50;
const FIELD_OFFICER_DETAIL_FIRST_ROW = 34;
const SLIPS_PER_A4_PAGE = 2;
const SLIP_PAGE_MARGINS = { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };

function slipRowAt(startRow, relRow) {
  return startRow + relRow - 1;
}

function a4PortraitPageSetup() {
  return {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: false,
    scale: 100,
    margins: SLIP_PAGE_MARGINS,
  };
}

const COL_WIDTHS = { A: 19, B: 16, C: 25, D: 16 };
const ROW_HEIGHT = 15;
const SIGNATURE_PLACEHOLDER = '(                              )';

const FONT_KETERANGAN = { name: 'Calibri', size: 8 };
const FONT_BODY = { name: 'Calibri', size: 11 };
const FONT_TITLE = { name: 'Calibri', size: 14, bold: true };
const FONT_COMPANY = { name: 'Calibri', size: 11 };
const FONT_TABLE_HEAD = { name: 'Calibri', size: 11, bold: true };
const FONT_TOTAL = { name: 'Calibri', size: 11, bold: true };
const FONT_NET_LABEL = { name: 'Calibri', size: 11, bold: true };
const FONT_NET_AMOUNT = { name: 'Calibri', size: 12, bold: true };

const BORDER_MEDIUM = { style: 'medium', color: { argb: 'FF000000' } };
const BORDER_THICK = { style: 'thick', color: { argb: 'FF000000' } };
const AMOUNT_NUMFMT = '#,##0';
const NET_AMOUNT_NUMFMT = '"Rp "#,##0';

function companyName() {
  return process.env.PAYROLL_COMPANY_NAME?.trim() || 'CV Harapan Jaya Sejahtera';
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeFilenamePart(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ');
}

function employeeSlipExportFilename(row) {
  const name = sanitizeFilenamePart(row.full_name || row.employee_code || 'Karyawan');
  return `Attendance Slip Gaji (${name}).xlsx`;
}

function colLetter(col) {
  let n = col;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function parseDateOnly(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const s = String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfPayrollMonth(period) {
  return cycleEndDate(period);
}

function countWorkingDaysMonSat(period) {
  return countWorkingDaysMonSatInCycle(period);
}

function computeUsiaKerja(joinDate, asOfDate) {
  const start = parseDateOnly(joinDate);
  const end = parseDateOnly(asOfDate);
  if (!start || !end || end < start) return '';

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts = [];
  if (years > 0) parts.push(`${years} tahun`);
  if (months > 0) parts.push(`${months} bulan`);
  if (days > 0 && years === 0 && months === 0) parts.push(`${days} hari`);
  if (!parts.length) return '0 hari';
  return parts.join(' ');
}

function slipAsOfDate(row, period) {
  return row.period_end || endOfPayrollMonth(period);
}

function slipAmounts(row) {
  const dailyWageSlip = usesDailyWagePayroll(row.user_role);
  const transportEligible = resolveTransportEligible(row);
  const diligenceEligible = resolveDiligenceEligible(row);
  const { transport_allowance: transport, diligence_bonus: kerajinan } = resolvePayrollAllowanceAmounts({
    transportEligible,
    diligenceEligible,
    transportAllowanceStored: row.transport_allowance,
    diligenceBonusStored: row.diligence_bonus,
    employeeTransportAmount: row.employee_transport_allowance_amount,
    employeeDiligenceAmount: row.employee_diligence_allowance_amount,
    settingsTransportAmount: row.settings_transport_amount,
    settingsDiligenceAmount: row.settings_diligence_amount,
  });
  const monthlyStaff =
    row.payroll_mode === 'monthly' ||
    row.payroll_mode === 'umum' ||
    row.payroll_mode === 'accounting';
  const monthlyGross =
    row.monthly_basic_gross != null
      ? num(row.monthly_basic_gross)
      : num(row.employee_basic_salary);
  let absenceDeduction = 0;
  if (!dailyWageSlip) {
    absenceDeduction = monthlyStaff ? num(row.absence_deduction) : 0;
    if (!monthlyStaff) {
      if (row.absence_deduction != null) {
        absenceDeduction = num(row.absence_deduction);
      } else if (row.payroll_mode !== 'manual') {
        const expected = expectedWorkDaysForSlip(row, row.payroll_period);
        const absentDays = Math.max(0, expected - num(row.days_attended));
        absenceDeduction = Math.round(absentDays * num(row.upah_harian));
      }
    }
  }

  let gajiLine;
  if (monthlyStaff) {
    gajiLine = monthlyGross;
  } else if (row.payroll_mode === 'manual') {
    gajiLine = num(row.basic_salary);
  } else {
    gajiLine = num(row.upah_harian);
  }

  return {
    gaji: gajiLine,
    tunjangan_masa_kerja: num(row.tunjangan_masa_kerja),
    tunjangan_transport: transport,
    lembur: num(row.overtime_pay),
    insentif: num(row.insentif),
    kerajinan,
    bonus: num(row.bonus_omset),
    potongan_absen: absenceDeduction,
    potongan_terlambat: num(row.late_deduction),
    bpjs_tk: num(row.bpjs_tk),
    bpjs_kes: num(row.bpjs_kes),
    pph21: num(row.pph_21),
    kasbon: num(row.loan_deduction ?? row.loan_deduction_preview),
    potongan_lain: num(row.other_deductions),
  };
}

function sumAmountKeys(amounts, items) {
  return items.reduce((sum, item) => sum + num(amounts[item.key]), 0);
}

function expectedWorkDaysForSlip(row, period) {
  if (row.expected_work_days != null) return num(row.expected_work_days);
  return countWorkingDaysMonSat(period);
}

function jabatanLabel(row) {
  const role = String(row.user_role || '').toLowerCase();
  const byRole = {
    field_officer: 'Petugas Lapangan',
    employee: 'Staff Kantor',
    umum: 'Cleaning',
    accounting: 'Accounting',
    general_affairs: 'General Affairs',
    head_of_finance: 'Head of Finance',
  };
  if (byRole[role]) return byRole[role];
  return row.position_title || row.department_name || row.jabatan || '';
}

function periodLabel(period) {
  return periodLabelCalendar(period);
}

function periodeLabel(period) {
  return periodLabelCalendar(period);
}

function gajiBulanLabel(period) {
  return periodLabelCalendar(period).toUpperCase();
}

function setCell(ws, row, col, value, opts = {}) {
  const cell = ws.getCell(row, col);
  cell.value = value ?? '';
  cell.font = { ...FONT_BODY, ...opts.font };
  if (opts.alignment) cell.alignment = opts.alignment;
  if (opts.numFmt) cell.numFmt = opts.numFmt;
}

function setColonText(ws, row, col, value) {
  setCell(ws, row, col, `${value ?? ''}`, {
    alignment: { horizontal: 'left', vertical: 'middle' },
  });
}

function setAmountCell(ws, row, col, amount) {
  const cell = ws.getCell(row, col);
  cell.value = num(amount);
  cell.numFmt = AMOUNT_NUMFMT;
  cell.font = FONT_BODY;
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
}

function setAmountFormulaCell(ws, row, col, formula, result) {
  const cell = ws.getCell(row, col);
  cell.value = { formula, result: num(result) };
  cell.numFmt = AMOUNT_NUMFMT;
  cell.font = FONT_BODY;
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
}

function setLabelColon(ws, row, col, label) {
  setCell(ws, row, col, `${label}`, {
    alignment: { horizontal: 'left', vertical: 'middle' },
  });
}

function mergeCellsLeft(ws, rowStart, rowEnd, col, value, opts = {}) {
  ws.mergeCells(rowStart, col, rowEnd, col);
  const cell = ws.getCell(rowStart, col);
  cell.value = value ?? '';
  cell.font = { ...FONT_BODY, ...opts.font };
  cell.alignment = { horizontal: 'left', vertical: 'middle', ...opts.alignment };
  if (opts.numFmt) cell.numFmt = opts.numFmt;
}

function applyColumnWidths(ws) {
  ws.getColumn(COL.A).width = COL_WIDTHS.A;
  ws.getColumn(COL.B).width = COL_WIDTHS.B;
  ws.getColumn(COL.C).width = COL_WIDTHS.C;
  ws.getColumn(COL.D).width = COL_WIDTHS.D;
}

function applyUniformRowHeights(ws, lastRelRow = BASE_SHEET_LAST_ROW, startRow = 1) {
  const end = slipRowAt(startRow, lastRelRow);
  for (let r = startRow; r <= end; r += 1) {
    ws.getRow(r).height = ROW_HEIGHT;
  }
}

function applyTableBorders(ws, lastRelRow = BASE_SHEET_LAST_ROW, startRow = 1) {
  const end = slipRowAt(startRow, lastRelRow);
  for (let r = startRow; r <= end; r += 1) {
    for (let c = COL.A; c <= COL.D; c += 1) {
      ws.getCell(r, c).border = {};
    }
  }

  const tableLast = slipRowAt(startRow, ROW.TABLE_LAST);
  for (let c = COL.A; c <= COL.D; c += 1) {
    ws.getCell(tableLast, c).border = { bottom: BORDER_MEDIUM };
  }
}

function markSlipBlockBottom(ws, bottomRow) {
  for (let c = COL.A; c <= COL.D; c += 1) {
    ws.getCell(bottomRow, c).border = { bottom: BORDER_MEDIUM };
  }
}

function fillTableLine(ws, row, labelCol, amountCol, label, amount) {
  setLabelColon(ws, row, labelCol, label);
  setAmountCell(ws, row, amountCol, amount);
}

function fillTableLineFormula(ws, row, labelCol, amountCol, label, formula, result) {
  setLabelColon(ws, row, labelCol, label);
  setAmountFormulaCell(ws, row, amountCol, formula, result);
}

function fieldOfficerEarningResult(row, amounts, key) {
  if (key === 'gaji') {
    const hariKerja = Math.max(0, num(row.days_attended));
    return num(row.upah_harian || 0) * hariKerja;
  }
  return num(amounts[key]);
}

function setThickBottomBorderRow(ws, rowNumber) {
  for (let c = COL.A; c <= COL.D; c += 1) {
    const current = ws.getCell(rowNumber, c).border || {};
    ws.getCell(rowNumber, c).border = { ...current, bottom: BORDER_THICK };
  }
}

function fieldOfficerEarningsTotal(row, amounts) {
  const hariKerja = Math.max(0, num(row.days_attended));
  const totalGaji = num(row.upah_harian || 0) * hariKerja;
  return (
    totalGaji +
    num(amounts.tunjangan_masa_kerja) +
    num(amounts.tunjangan_transport) +
    num(amounts.lembur) +
    num(amounts.insentif) +
    num(amounts.kerajinan) +
    num(amounts.bonus)
  );
}

function addFieldOfficerCalculationSection(
  ws,
  row,
  period,
  amounts,
  totalPendapatan,
  netPay,
  startRow = 1
) {
  const R = (rel) => slipRowAt(startRow, rel);
  const hariKerja = Math.max(0, num(row.days_attended));
  const gajiPerHari = num(row.upah_harian || 0);
  const totalGaji = gajiPerHari * hariKerja;
  const detailTotalPendapatan = fieldOfficerEarningsTotal(row, amounts);
  const fieldOfficerNet = detailTotalPendapatan;

  setCell(ws, R(28), COL.A, 'Nama');
  setCell(ws, R(28), COL.B, row.full_name || '');
  setCell(ws, R(28), COL.C, 'Periode Gaji');
  setCell(ws, R(28), COL.D, periodeLabel(period));

  setCell(ws, R(29), COL.A, 'Jabatan');
  setCell(ws, R(29), COL.B, jabatanLabel(row) || '');
  setCell(ws, R(29), COL.C, 'Usia Kerja');
  setCell(ws, R(29), COL.D, computeUsiaKerja(row.join_date, slipAsOfDate(row, period)));

  setCell(ws, R(31), COL.A, 'RINCIAN PERHITUNGAN GAJI', { font: FONT_TABLE_HEAD });
  setCell(ws, R(32), COL.A, 'Hari Kerja');
  setCell(ws, R(32), COL.D, hariKerja, { alignment: { horizontal: 'right', vertical: 'middle' } });

  setCell(ws, R(33), COL.A, 'Gaji Per Hari');
  setAmountCell(ws, R(33), COL.D, gajiPerHari);
  setThickBottomBorderRow(ws, R(33));

  ws.mergeCells(R(34), COL.A, R(34), COL.B);
  setCell(ws, R(34), COL.A, 'Total Gaji', {
    font: FONT_TOTAL,
    alignment: { horizontal: 'center', vertical: 'middle' },
  });
  setAmountCell(ws, R(34), COL.D, totalGaji);
  ws.getCell(R(34), COL.D).font = FONT_TOTAL;

  setLabelColon(ws, R(35), COL.A, 'Tunjangan Masa Kerja');
  setAmountCell(ws, R(35), COL.D, amounts.tunjangan_masa_kerja);
  setLabelColon(ws, R(36), COL.A, 'Tunjangan Transport');
  setAmountCell(ws, R(36), COL.D, amounts.tunjangan_transport);
  setLabelColon(ws, R(37), COL.A, 'Lembur');
  setAmountCell(ws, R(37), COL.D, amounts.lembur);
  setLabelColon(ws, R(38), COL.A, 'Insentif');
  setAmountCell(ws, R(38), COL.D, amounts.insentif);
  setLabelColon(ws, R(39), COL.A, 'Kerajinan');
  setAmountCell(ws, R(39), COL.D, amounts.kerajinan);
  setLabelColon(ws, R(40), COL.A, 'Bonus');
  setAmountCell(ws, R(40), COL.D, amounts.bonus);
  setThickBottomBorderRow(ws, R(40));

  ws.mergeCells(R(41), COL.A, R(41), COL.B);
  setCell(ws, R(41), COL.A, 'Total Gaji', {
    font: FONT_TOTAL,
    alignment: { horizontal: 'center', vertical: 'middle' },
  });
  setAmountCell(ws, R(41), COL.D, detailTotalPendapatan);
  ws.getCell(R(41), COL.D).font = FONT_TOTAL;
  ws.getCell(R(41), COL.D).border = { top: BORDER_MEDIUM };

  ws.mergeCells(R(43), COL.A, R(43), COL.B);
  setCell(ws, R(43), COL.A, 'Total Gaji yang diterima', { font: FONT_TOTAL });
  setAmountCell(ws, R(43), COL.D, fieldOfficerNet);
  ws.getCell(R(43), COL.D).font = FONT_TOTAL;

  setLabelColon(ws, R(45), COL.C, 'Jumlah Hadir');
  setCell(ws, R(45), COL.D, hariKerja, {
    alignment: { horizontal: 'left', vertical: 'middle' },
  });

  setCell(ws, R(47), COL.A, 'Keterangan :');
  ws.mergeCells(R(48), COL.A, R(49), COL.B);
  setCell(ws, R(48), COL.A, row.keterangan || '', {
    font: FONT_KETERANGAN,
    alignment: { vertical: 'top', horizontal: 'left', wrapText: true },
  });

  ws.mergeCells(R(47), COL.C, R(48), COL.D);
  setCell(ws, R(47), COL.C, 'Total Penerimaan Bulan ini', {
    font: FONT_NET_LABEL,
    alignment: { horizontal: 'center', vertical: 'middle' },
  });
  ws.mergeCells(R(49), COL.C, R(50), COL.D);
  const fieldNetCell = ws.getCell(R(49), COL.C);
  fieldNetCell.value = { formula: `D${R(41)}`, result: fieldOfficerNet };
  fieldNetCell.numFmt = NET_AMOUNT_NUMFMT;
  fieldNetCell.font = FONT_NET_AMOUNT;
  fieldNetCell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function writeSlipBlock(ws, row, period, startRow = 1, { compact = false } = {}) {
  const R = (rel) => slipRowAt(startRow, rel);
  const amounts = slipAmounts(row);
  const dailyWageSlip = usesDailyWagePayroll(row.user_role);
  const isFieldOfficerSlip = dailyWageSlip && !compact;
  const useDailyWageAmounts = dailyWageSlip && compact;
  const totalPendapatan = isFieldOfficerSlip || useDailyWageAmounts
    ? fieldOfficerEarningsTotal(row, amounts)
    : sumAmountKeys(amounts, EARNINGS);
  const totalPotongan = isFieldOfficerSlip || useDailyWageAmounts
    ? sumAmountKeys(amounts, DEDUCTIONS.filter((d) => d.key !== 'potongan_absen'))
    : sumAmountKeys(amounts, DEDUCTIONS);
  const netPay =
    num(row.final_salary) ||
    Math.max(0, totalPendapatan - totalPotongan);
  const bAmt = colLetter(COL.B);
  const dAmt = colLetter(COL.D);
  const totalRow = R(ROW.TABLE_TOTAL);

  mergeCellsLeft(ws, R(1), R(2), COL.A, 'Nama');
  mergeCellsLeft(ws, R(1), R(2), COL.B, `${row.full_name || ''}`, {
    alignment: { wrapText: true },
  });

  ws.mergeCells(R(1), COL.C, R(2), COL.D);
  const titleCell = ws.getCell(R(1), COL.C);
  titleCell.value = 'SLIP GAJI';
  titleCell.font = FONT_TITLE;
  titleCell.alignment = { horizontal: 'right', vertical: 'middle' };

  mergeCellsLeft(ws, R(3), R(4), COL.A, 'Jabatan');
  mergeCellsLeft(ws, R(3), R(4), COL.B, `${jabatanLabel(row)}`);

  ws.mergeCells(R(3), COL.C, R(3), COL.D);
  const companyCell = ws.getCell(R(3), COL.C);
  companyCell.value = companyName();
  companyCell.font = FONT_COMPANY;
  companyCell.alignment = { horizontal: 'right', vertical: 'middle' };

  setCell(ws, R(ROW.PERIODE), COL.C, 'Periode Gaji', {
    alignment: { horizontal: 'right', vertical: 'middle' },
  });
  setCell(ws, R(ROW.PERIODE), COL.D, periodeLabel(period), {
    alignment: { horizontal: 'right', vertical: 'middle' },
  });

  ws.mergeCells(R(ROW.TABLE_HEAD), COL.A, R(ROW.TABLE_HEAD), COL.B);
  const pendapatanHead = ws.getCell(R(ROW.TABLE_HEAD), COL.A);
  pendapatanHead.value = 'Pendapatan';
  pendapatanHead.font = FONT_TABLE_HEAD;
  pendapatanHead.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(R(ROW.TABLE_HEAD), COL.C, R(ROW.TABLE_HEAD), COL.D);
  const potonganHead = ws.getCell(R(ROW.TABLE_HEAD), COL.C);
  potonganHead.value = 'Potongan';
  potonganHead.font = FONT_TABLE_HEAD;
  potonganHead.alignment = { horizontal: 'center', vertical: 'middle' };

  if (isFieldOfficerSlip) {
    addFieldOfficerCalculationSection(ws, row, period, amounts, totalPendapatan, netPay, startRow);
  }

  for (let i = 0; i < EARNINGS.length; i += 1) {
    const r = R(ROW.TABLE_FIRST + i);
    if (isFieldOfficerSlip) {
      const detailRow = R(FIELD_OFFICER_DETAIL_FIRST_ROW + i);
      fillTableLineFormula(
        ws,
        r,
        COL.A,
        COL.B,
        EARNINGS[i].label,
        `D${detailRow}`,
        fieldOfficerEarningResult(row, amounts, EARNINGS[i].key)
      );
    } else if (useDailyWageAmounts) {
      fillTableLine(
        ws,
        r,
        COL.A,
        COL.B,
        EARNINGS[i].label,
        fieldOfficerEarningResult(row, amounts, EARNINGS[i].key)
      );
    } else {
      fillTableLine(ws, r, COL.A, COL.B, EARNINGS[i].label, amounts[EARNINGS[i].key]);
    }
    if (i < DEDUCTIONS.length) {
      const deductionKey = DEDUCTIONS[i].key;
      const deductionAmount =
        (isFieldOfficerSlip || useDailyWageAmounts) && deductionKey === 'potongan_absen'
          ? 0
          : amounts[deductionKey];
      fillTableLine(ws, r, COL.C, COL.D, DEDUCTIONS[i].label, deductionAmount);
    }
  }

  setLabelColon(ws, totalRow, COL.A, 'Total Pendapatan');
  const leftTotal = ws.getCell(totalRow, COL.B);
  leftTotal.value = {
    formula: `SUM(${bAmt}${R(ROW.TABLE_FIRST)}:${bAmt}${R(ROW.TABLE_LAST)})`,
    result: totalPendapatan,
  };
  leftTotal.numFmt = AMOUNT_NUMFMT;
  leftTotal.font = FONT_TOTAL;
  leftTotal.alignment = { horizontal: 'right', vertical: 'middle' };

  setLabelColon(ws, totalRow, COL.C, 'Total Potongan');
  const rightTotal = ws.getCell(totalRow, COL.D);
  rightTotal.value = {
    formula: `SUM(${dAmt}${R(ROW.TABLE_FIRST)}:${dAmt}${R(ROW.TABLE_LAST)})`,
    result: totalPotongan,
  };
  rightTotal.numFmt = AMOUNT_NUMFMT;
  rightTotal.font = FONT_TOTAL;
  rightTotal.alignment = { horizontal: 'right', vertical: 'middle' };

  const borderLastRel = isFieldOfficerSlip ? FIELD_OFFICER_SECTION_LAST_ROW : BASE_SHEET_LAST_ROW;
  applyTableBorders(ws, borderLastRel, startRow);

  if (!isFieldOfficerSlip && !useDailyWageAmounts) {
    setLabelColon(ws, R(ROW.JUMLAH_HARI), COL.A, 'Jumlah Hari');
    setColonText(ws, R(ROW.JUMLAH_HARI), COL.B, expectedWorkDaysForSlip(row, period));
  }

  setLabelColon(ws, R(ROW.JUMLAH_HADIR), COL.A, 'Jumlah Hadir');
  setColonText(ws, R(ROW.JUMLAH_HADIR), COL.B, num(row.days_attended));

  setCell(ws, R(ROW.JUMLAH_HARI), COL.C, 'Keterangan', {
    alignment: { horizontal: 'left', vertical: 'middle' },
  });

  ws.mergeCells(R(ROW.KETERANGAN_START), COL.C, R(ROW.KETERANGAN_END), COL.D);
  const ketCell = ws.getCell(R(ROW.KETERANGAN_START), COL.C);
  ketCell.value = row.keterangan || '';
  ketCell.font = FONT_KETERANGAN;
  ketCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };

  ws.getCell(R(ROW.SIGN_TITLE), COL.A).value = 'Penerima';
  ws.getCell(R(ROW.SIGN_TITLE), COL.A).font = FONT_BODY;
  ws.getCell(R(ROW.SIGN_TITLE), COL.A).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell(R(ROW.SIGN_TITLE), COL.B).value = 'Disetujui Oleh';
  ws.getCell(R(ROW.SIGN_TITLE), COL.B).font = FONT_BODY;
  ws.getCell(R(ROW.SIGN_TITLE), COL.B).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell(R(ROW.SIGN_LINE), COL.A).value = SIGNATURE_PLACEHOLDER;
  ws.getCell(R(ROW.SIGN_LINE), COL.A).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell(R(ROW.SIGN_LINE), COL.B).value = SIGNATURE_PLACEHOLDER;
  ws.getCell(R(ROW.SIGN_LINE), COL.B).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(R(ROW.NET_LABEL_START), COL.C, R(ROW.NET_LABEL_END), COL.D);
  const netLabel = ws.getCell(R(ROW.NET_LABEL_START), COL.C);
  netLabel.value = 'Total Penerimaan Bulan ini';
  netLabel.font = FONT_NET_LABEL;
  netLabel.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(R(ROW.NET_AMOUNT_START), COL.C, R(ROW.NET_AMOUNT_END), COL.D);
  const netAmount = ws.getCell(R(ROW.NET_AMOUNT_START), COL.C);
  netAmount.value = {
    formula: `${bAmt}${totalRow}-${dAmt}${totalRow}`,
    result: netPay,
  };
  netAmount.numFmt = NET_AMOUNT_NUMFMT;
  netAmount.font = FONT_NET_AMOUNT;
  netAmount.alignment = { horizontal: 'center', vertical: 'middle' };

  applyUniformRowHeights(ws, borderLastRel, startRow);

  return slipRowAt(startRow, BASE_SHEET_LAST_ROW);
}

function addSlipSheet(wb, row, period, sheetName = 'Slip Gaji') {
  const ws = wb.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
    pageSetup: {
      ...a4PortraitPageSetup(),
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  applyColumnWidths(ws);
  writeSlipBlock(ws, row, period, 1, { compact: false });
  return ws;
}

function slipWorkbookFromRows(rows, period) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Web-Based Attendance';
  const ws = wb.addWorksheet('Slip Gaji', {
    views: [{ showGridLines: true }],
    pageSetup: a4PortraitPageSetup(),
  });
  applyColumnWidths(ws);

  rows.forEach((row, i) => {
    const startRow = i * BASE_SHEET_LAST_ROW + 1;
    const bottomRow = writeSlipBlock(ws, row, period, startRow, { compact: true });
    markSlipBlockBottom(ws, bottomRow);

    const slipsOnPage = (i % SLIPS_PER_A4_PAGE) + 1;
    if (slipsOnPage === SLIPS_PER_A4_PAGE && i + 1 < rows.length) {
      ws.getRow(bottomRow).addPageBreak();
    }
  });

  return wb;
}

function buildEmployeeSlipWorkbook(row, period) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Web-Based Attendance';
  addSlipSheet(wb, row, period, 'Slip Gaji');
  return wb;
}

async function writeSlipBuffer(wb) {
  return wb.xlsx.writeBuffer();
}

module.exports = {
  companyName,
  periodLabel,
  gajiBulanLabel,
  periodeLabel,
  computeUsiaKerja,
  countWorkingDaysMonSat,
  slipAmounts,
  employeeSlipExportFilename,
  addSlipSheet,
  buildEmployeeSlipWorkbook,
  slipWorkbookFromRows,
  writeSlipBuffer,
};
