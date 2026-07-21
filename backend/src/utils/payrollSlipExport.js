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

/** Rows × cols per employee panel on the combined A5 print sheet. */
const PANEL_ROWS = 16;
const PANEL_COLS = 4;

const FONT_COMPACT_BODY = { name: 'Calibri', size: 7 };
const FONT_COMPACT_TITLE = { name: 'Calibri', size: 9, bold: true };
const FONT_COMPACT_HEAD = { name: 'Calibri', size: 7, bold: true };
const FONT_COMPACT_NET = { name: 'Calibri', size: 8, bold: true };
const PANEL_ROW_HEIGHT = 11;

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

const AMOUNT_NUMFMT = '#,##0';
const NET_AMOUNT_NUMFMT = '"Rp "#,##0';

const SLIP_PAGE_SETUP = {
  paperSize: 11,
  orientation: 'landscape',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 1,
  margins: { top: 1, left: 0, right: 0, bottom: 0, header: 0.5, footer: 0.5 },
};

/** Same A5 landscape slip as single export; fit applies per print-area block, not the whole sheet. */
const BULK_SLIP_PAGE_SETUP = {
  paperSize: 11,
  orientation: 'landscape',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 1,
  margins: { top: 1, left: 0, right: 0, bottom: 0, header: 0.5, footer: 0.5 },
};

function bulkSlipPrintArea(slipCount) {
  if (slipCount < 1) return undefined;
  const lastCol = colLetter(COL.D);
  const parts = [];
  for (let i = 0; i < slipCount; i += 1) {
    const start = i * BASE_SHEET_LAST_ROW + 1;
    const end = start + BASE_SHEET_LAST_ROW - 1;
    parts.push(`A${start}:${lastCol}${end}`);
  }
  // ponytail: ExcelJS splits multi-area print regions on &&, not comma (comma breaks Excel Print_Area).
  return parts.join('&&');
}

function slipRow(startRow, logicalRow) {
  return startRow + logicalRow - 1;
}

function slipContentLastRow() {
  return BASE_SHEET_LAST_ROW;
}

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

function absCell(ws, originRow, originCol, relRow, relCol) {
  return ws.getCell(originRow + relRow - 1, originCol + relCol - 1);
}

function setCellAt(ws, originRow, originCol, relRow, relCol, value, opts = {}) {
  const cell = absCell(ws, originRow, originCol, relRow, relCol);
  cell.value = value ?? '';
  cell.font = { ...(opts.font || FONT_COMPACT_BODY), ...opts.font };
  if (opts.alignment) cell.alignment = opts.alignment;
  if (opts.numFmt) cell.numFmt = opts.numFmt;
}

function setAmountAt(ws, originRow, originCol, relRow, relCol, amount, font = FONT_COMPACT_BODY) {
  const cell = absCell(ws, originRow, originCol, relRow, relCol);
  cell.value = num(amount);
  cell.numFmt = AMOUNT_NUMFMT;
  cell.font = font;
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
}

function gridLayout(employeeCount) {
  const n = Math.max(1, employeeCount);
  let cols = Math.ceil(Math.sqrt(n));
  while (cols > 1 && Math.ceil(n / (cols - 1)) <= Math.ceil(n / cols)) {
    cols -= 1;
  }
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

function panelPrintArea(gridCols, gridRows) {
  const lastRow = gridRows * PANEL_ROWS;
  const lastCol = gridCols * PANEL_COLS;
  return `A1:${colLetter(lastCol)}${lastRow}`;
}

function applyPanelOuterBorder(ws, originRow, originCol) {
  const r0 = originRow;
  const c0 = originCol;
  const r1 = originRow + PANEL_ROWS - 1;
  const c1 = originCol + PANEL_COLS - 1;
  const thin = { style: 'thin', color: { argb: 'FF000000' } };
  for (let c = c0; c <= c1; c += 1) {
    const top = ws.getCell(r0, c).border || {};
    const bottom = ws.getCell(r1, c).border || {};
    ws.getCell(r0, c).border = { ...top, top: thin };
    ws.getCell(r1, c).border = { ...bottom, bottom: thin };
  }
  for (let r = r0; r <= r1; r += 1) {
    const left = ws.getCell(r, c0).border || {};
    const right = ws.getCell(r, c1).border || {};
    ws.getCell(r, c0).border = { ...left, left: thin };
    ws.getCell(r, c1).border = { ...right, right: thin };
  }
}

function applyPanelColumnWidths(ws, originCol) {
  const widths = [11, 9, 11, 9];
  widths.forEach((w, i) => {
    const col = ws.getColumn(originCol + i);
    if (!col.width || col.width < w) col.width = w;
  });
}

function slipTotals(row, amounts) {
  const isDaily = usesDailyWagePayroll(row.user_role);
  const totalPendapatan = isDaily
    ? fieldOfficerEarningsTotal(row, amounts)
    : sumAmountKeys(amounts, EARNINGS);
  const totalPotongan = isDaily
    ? sumAmountKeys(amounts, DEDUCTIONS.filter((d) => d.key !== 'potongan_absen'))
    : sumAmountKeys(amounts, DEDUCTIONS);
  const netPay =
    num(row.final_salary) || Math.max(0, totalPendapatan - totalPotongan);
  return { isDaily, totalPendapatan, totalPotongan, netPay };
}

function addCompactSlipPanel(ws, row, period, originRow, originCol) {
  const amounts = slipAmounts(row);
  const { isDaily, totalPendapatan, totalPotongan, netPay } = slipTotals(row, amounts);

  applyPanelColumnWidths(ws, originCol);
  for (let r = 0; r < PANEL_ROWS; r += 1) {
    ws.getRow(originRow + r).height = PANEL_ROW_HEIGHT;
  }

  ws.mergeCells(originRow, originCol, originRow + 1, originCol);
  setCellAt(ws, originRow, originCol, 1, 1, row.full_name || '', {
    font: { ...FONT_COMPACT_BODY, bold: true },
    alignment: { vertical: 'middle', wrapText: true },
  });

  ws.mergeCells(originRow, originCol + 2, originRow + 1, originCol + 3);
  setCellAt(ws, originRow, originCol, 1, 3, 'SLIP GAJI', {
    font: FONT_COMPACT_TITLE,
    alignment: { horizontal: 'right', vertical: 'middle' },
  });

  ws.mergeCells(originRow + 2, originCol, originRow + 2, originCol + 1);
  setCellAt(ws, originRow, originCol, 3, 1, jabatanLabel(row) || '', {
    alignment: { vertical: 'middle', wrapText: true },
  });

  ws.mergeCells(originRow + 2, originCol + 2, originRow + 2, originCol + 3);
  setCellAt(ws, originRow, originCol, 3, 3, periodeLabel(period), {
    font: FONT_COMPACT_BODY,
    alignment: { horizontal: 'right', vertical: 'middle' },
  });

  ws.mergeCells(originRow + 3, originCol, originRow + 3, originCol + 3);
  setCellAt(ws, originRow, originCol, 4, 1, companyName(), {
    font: FONT_COMPACT_BODY,
    alignment: { horizontal: 'center', vertical: 'middle' },
  });

  ws.mergeCells(originRow + 4, originCol, originRow + 4, originCol + 1);
  setCellAt(ws, originRow, originCol, 5, 1, 'Pendapatan', {
    font: FONT_COMPACT_HEAD,
    alignment: { horizontal: 'center', vertical: 'middle' },
  });
  ws.mergeCells(originRow + 4, originCol + 2, originRow + 4, originCol + 3);
  setCellAt(ws, originRow, originCol, 5, 3, 'Potongan', {
    font: FONT_COMPACT_HEAD,
    alignment: { horizontal: 'center', vertical: 'middle' },
  });

  const lineCount = Math.min(EARNINGS.length, DEDUCTIONS.length);
  for (let i = 0; i < lineCount; i += 1) {
    const rel = 6 + i;
    let earnAmount = amounts[EARNINGS[i].key];
    if (isDaily && EARNINGS[i].key === 'gaji') {
      earnAmount = fieldOfficerEarningResult(row, amounts, 'gaji');
    }
    setCellAt(ws, originRow, originCol, rel, 1, EARNINGS[i].label, {
      alignment: { vertical: 'middle' },
    });
    setAmountAt(ws, originRow, originCol, rel, 2, earnAmount);
    const dedKey = DEDUCTIONS[i].key;
    const dedAmount =
      isDaily && dedKey === 'potongan_absen' ? 0 : amounts[dedKey];
    setCellAt(ws, originRow, originCol, rel, 3, DEDUCTIONS[i].label, {
      alignment: { vertical: 'middle' },
    });
    setAmountAt(ws, originRow, originCol, rel, 4, dedAmount);
  }

  const totalRel = 6 + lineCount;
  setCellAt(ws, originRow, originCol, totalRel, 1, 'Total', { font: FONT_COMPACT_HEAD });
  setAmountAt(ws, originRow, originCol, totalRel, 2, totalPendapatan, FONT_COMPACT_HEAD);
  setCellAt(ws, originRow, originCol, totalRel, 3, 'Total', { font: FONT_COMPACT_HEAD });
  setAmountAt(ws, originRow, originCol, totalRel, 4, totalPotongan, FONT_COMPACT_HEAD);

  const infoRel = totalRel + 1;
  setCellAt(ws, originRow, originCol, infoRel, 1, 'Hadir');
  setCellAt(ws, originRow, originCol, infoRel, 2, String(num(row.days_attended)), {
    alignment: { horizontal: 'right', vertical: 'middle' },
  });
  if (!isDaily) {
    setCellAt(ws, originRow, originCol, infoRel, 3, 'Hari');
    setCellAt(
      ws,
      originRow,
      originCol,
      infoRel,
      4,
      String(expectedWorkDaysForSlip(row, period)),
      { alignment: { horizontal: 'right', vertical: 'middle' } }
    );
  }

  const netRel = infoRel + 1;
  ws.mergeCells(originRow + netRel - 1, originCol, originRow + netRel - 1, originCol + 1);
  setCellAt(ws, originRow, originCol, netRel, 1, 'Total diterima', { font: FONT_COMPACT_NET });
  ws.mergeCells(originRow + netRel - 1, originCol + 2, originRow + netRel - 1, originCol + 3);
  const netCell = absCell(ws, originRow, originCol, netRel, 3);
  netCell.value = netPay;
  netCell.numFmt = NET_AMOUNT_NUMFMT;
  netCell.font = FONT_COMPACT_NET;
  netCell.alignment = { horizontal: 'right', vertical: 'middle' };

  const signRel = netRel + 1;
  ws.mergeCells(originRow + signRel - 1, originCol, originRow + signRel - 1, originCol + 1);
  setCellAt(ws, originRow, originCol, signRel, 1, 'Penerima', {
    alignment: { horizontal: 'center', vertical: 'middle' },
  });
  ws.mergeCells(originRow + signRel - 1, originCol + 2, originRow + signRel - 1, originCol + 3);
  setCellAt(ws, originRow, originCol, signRel, 3, 'Disetujui', {
    alignment: { horizontal: 'center', vertical: 'middle' },
  });

  applyPanelOuterBorder(ws, originRow, originCol);
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

function applyUniformRowHeights(ws, lastRow = BASE_SHEET_LAST_ROW) {
  for (let r = 1; r <= lastRow; r += 1) {
    ws.getRow(r).height = ROW_HEIGHT;
  }
}

function applyTableBorders(ws, lastRow = BASE_SHEET_LAST_ROW) {
  for (let r = 1; r <= lastRow; r += 1) {
    for (let c = COL.A; c <= COL.D; c += 1) {
      ws.getCell(r, c).border = {};
    }
  }
}

function fillTableLine(ws, row, labelCol, amountCol, label, amount) {
  setLabelColon(ws, row, labelCol, label);
  setAmountCell(ws, row, amountCol, amount);
}

function fieldOfficerEarningResult(row, amounts, key) {
  if (key === 'gaji') {
    const hariKerja = Math.max(0, num(row.days_attended));
    return num(row.upah_harian || 0) * hariKerja;
  }
  return num(amounts[key]);
}

function earningAmountForSlip(row, amounts, key) {
  if (usesDailyWagePayroll(row.user_role) && key === 'gaji') {
    return fieldOfficerEarningResult(row, amounts, key);
  }
  return amounts[key];
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

function applyTableBordersForBlock(ws, startRow, lastLogicalRow) {
  const first = slipRow(startRow, 1);
  const last = slipRow(startRow, lastLogicalRow);
  for (let r = first; r <= last; r += 1) {
    for (let c = COL.A; c <= COL.D; c += 1) {
      ws.getCell(r, c).border = {};
    }
  }
}

function applyUniformRowHeightsForBlock(ws, startRow, lastLogicalRow) {
  const first = slipRow(startRow, 1);
  const last = slipRow(startRow, lastLogicalRow);
  for (let r = first; r <= last; r += 1) {
    ws.getRow(r).height = ROW_HEIGHT;
  }
}

/** Renders one full slip starting at startRow; returns absolute last row of the block. */
function renderSlipOnWorksheet(ws, row, period, startRow = 1) {
  const sr = (n) => slipRow(startRow, n);

  const amounts = slipAmounts(row);
  const { totalPendapatan, totalPotongan, netPay } = slipTotals(row, amounts);
  const bAmt = colLetter(COL.B);
  const dAmt = colLetter(COL.D);
  const totalRow = ROW.TABLE_TOTAL;
  const lastLogical = slipContentLastRow();
  const isDailyWage = usesDailyWagePayroll(row.user_role);

  mergeCellsLeft(ws, sr(1), sr(2), COL.A, 'Nama');
  mergeCellsLeft(ws, sr(1), sr(2), COL.B, `${row.full_name || ''}`, {
    alignment: { wrapText: true },
  });

  ws.mergeCells(sr(1), COL.C, sr(2), COL.D);
  const titleCell = ws.getCell(sr(1), COL.C);
  titleCell.value = 'SLIP GAJI';
  titleCell.font = FONT_TITLE;
  titleCell.alignment = { horizontal: 'right', vertical: 'middle' };

  mergeCellsLeft(ws, sr(3), sr(4), COL.A, 'Jabatan');
  mergeCellsLeft(ws, sr(3), sr(4), COL.B, `${jabatanLabel(row)}`);

  ws.mergeCells(sr(3), COL.C, sr(3), COL.D);
  const companyCell = ws.getCell(sr(3), COL.C);
  companyCell.value = companyName();
  companyCell.font = FONT_COMPANY;
  companyCell.alignment = { horizontal: 'right', vertical: 'middle' };

  setCell(ws, sr(ROW.PERIODE), COL.C, 'Periode Gaji', {
    alignment: { horizontal: 'right', vertical: 'middle' },
  });
  setCell(ws, sr(ROW.PERIODE), COL.D, periodeLabel(period), {
    alignment: { horizontal: 'right', vertical: 'middle' },
  });

  ws.mergeCells(sr(ROW.TABLE_HEAD), COL.A, sr(ROW.TABLE_HEAD), COL.B);
  const pendapatanHead = ws.getCell(sr(ROW.TABLE_HEAD), COL.A);
  pendapatanHead.value = 'Pendapatan';
  pendapatanHead.font = FONT_TABLE_HEAD;
  pendapatanHead.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(sr(ROW.TABLE_HEAD), COL.C, sr(ROW.TABLE_HEAD), COL.D);
  const potonganHead = ws.getCell(sr(ROW.TABLE_HEAD), COL.C);
  potonganHead.value = 'Potongan';
  potonganHead.font = FONT_TABLE_HEAD;
  potonganHead.alignment = { horizontal: 'center', vertical: 'middle' };

  for (let i = 0; i < EARNINGS.length; i += 1) {
    const r = ROW.TABLE_FIRST + i;
    fillTableLine(
      ws,
      sr(r),
      COL.A,
      COL.B,
      EARNINGS[i].label,
      earningAmountForSlip(row, amounts, EARNINGS[i].key)
    );
    if (i < DEDUCTIONS.length) {
      const deductionKey = DEDUCTIONS[i].key;
      const deductionAmount =
        isDailyWage && deductionKey === 'potongan_absen' ? 0 : amounts[deductionKey];
      fillTableLine(ws, sr(r), COL.C, COL.D, DEDUCTIONS[i].label, deductionAmount);
    }
  }

  setLabelColon(ws, sr(totalRow), COL.A, 'Total Pendapatan');
  const leftTotal = ws.getCell(sr(totalRow), COL.B);
  leftTotal.value = {
    formula: `SUM(${bAmt}${sr(ROW.TABLE_FIRST)}:${bAmt}${sr(ROW.TABLE_LAST)})`,
    result: totalPendapatan,
  };
  leftTotal.numFmt = AMOUNT_NUMFMT;
  leftTotal.font = FONT_TOTAL;
  leftTotal.alignment = { horizontal: 'right', vertical: 'middle' };

  setLabelColon(ws, sr(totalRow), COL.C, 'Total Potongan');
  const rightTotal = ws.getCell(sr(totalRow), COL.D);
  rightTotal.value = {
    formula: `SUM(${dAmt}${sr(ROW.TABLE_FIRST)}:${dAmt}${sr(ROW.TABLE_LAST)})`,
    result: totalPotongan,
  };
  rightTotal.numFmt = AMOUNT_NUMFMT;
  rightTotal.font = FONT_TOTAL;
  rightTotal.alignment = { horizontal: 'right', vertical: 'middle' };

  applyTableBordersForBlock(ws, startRow, lastLogical);

  if (!isDailyWage) {
    setLabelColon(ws, sr(ROW.JUMLAH_HARI), COL.A, 'Jumlah Hari');
    setColonText(ws, sr(ROW.JUMLAH_HARI), COL.B, expectedWorkDaysForSlip(row, period));
  }

  setLabelColon(ws, sr(ROW.JUMLAH_HADIR), COL.A, 'Jumlah Hadir');
  setColonText(ws, sr(ROW.JUMLAH_HADIR), COL.B, num(row.days_attended));

  setCell(ws, sr(ROW.JUMLAH_HARI), COL.C, 'Keterangan', {
    alignment: { horizontal: 'left', vertical: 'middle' },
  });

  ws.mergeCells(sr(ROW.KETERANGAN_START), COL.C, sr(ROW.KETERANGAN_END), COL.D);
  const ketCell = ws.getCell(sr(ROW.KETERANGAN_START), COL.C);
  ketCell.value = row.keterangan || '';
  ketCell.font = FONT_KETERANGAN;
  ketCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };

  ws.getCell(sr(ROW.SIGN_TITLE), COL.A).value = 'Penerima';
  ws.getCell(sr(ROW.SIGN_TITLE), COL.A).font = FONT_BODY;
  ws.getCell(sr(ROW.SIGN_TITLE), COL.A).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell(sr(ROW.SIGN_TITLE), COL.B).value = 'Disetujui Oleh';
  ws.getCell(sr(ROW.SIGN_TITLE), COL.B).font = FONT_BODY;
  ws.getCell(sr(ROW.SIGN_TITLE), COL.B).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell(sr(ROW.SIGN_LINE), COL.A).value = SIGNATURE_PLACEHOLDER;
  ws.getCell(sr(ROW.SIGN_LINE), COL.A).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell(sr(ROW.SIGN_LINE), COL.B).value = SIGNATURE_PLACEHOLDER;
  ws.getCell(sr(ROW.SIGN_LINE), COL.B).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(sr(ROW.NET_LABEL_START), COL.C, sr(ROW.NET_LABEL_END), COL.D);
  const netLabel = ws.getCell(sr(ROW.NET_LABEL_START), COL.C);
  netLabel.value = 'Total Penerimaan Bulan ini';
  netLabel.font = FONT_NET_LABEL;
  netLabel.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(sr(ROW.NET_AMOUNT_START), COL.C, sr(ROW.NET_AMOUNT_END), COL.D);
  const netAmount = ws.getCell(sr(ROW.NET_AMOUNT_START), COL.C);
  netAmount.value = {
    formula: `${bAmt}${sr(totalRow)}-${dAmt}${sr(totalRow)}`,
    result: netPay,
  };
  netAmount.numFmt = NET_AMOUNT_NUMFMT;
  netAmount.font = FONT_NET_AMOUNT;
  netAmount.alignment = { horizontal: 'center', vertical: 'middle' };

  applyUniformRowHeightsForBlock(ws, startRow, lastLogical);

  return slipRow(startRow, lastLogical);
}

function addHorizontalPageBreak(ws, afterRow) {
  ws.rowBreaks.push({ id: afterRow + 1, max: 16383, man: 1 });
}

function addSlipSheet(wb, row, period, sheetName = 'Slip Gaji') {
  const ws = wb.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
    pageSetup: { ...SLIP_PAGE_SETUP },
  });
  applyColumnWidths(ws);
  renderSlipOnWorksheet(ws, row, period, 1);
  return ws;
}

function slipWorkbookFromRows(rows, period) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Web-Based Attendance';

  if (!rows.length) return wb;

  const ws = wb.addWorksheet('Semua Slip', {
    views: [{ showGridLines: true }],
    pageSetup: { ...BULK_SLIP_PAGE_SETUP },
  });
  applyColumnWidths(ws);

  let startRow = 1;
  rows.forEach((row, index) => {
    const blockEnd = renderSlipOnWorksheet(ws, row, period, startRow);
    if (index < rows.length - 1) {
      addHorizontalPageBreak(ws, blockEnd);
      startRow = blockEnd + 1;
    }
  });

  ws.pageSetup.printArea = bulkSlipPrintArea(rows.length);
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
  gridLayout,
  PANEL_ROWS,
  PANEL_COLS,
  BASE_SHEET_LAST_ROW,
  BULK_SLIP_PAGE_SETUP,
  bulkSlipPrintArea,
};
