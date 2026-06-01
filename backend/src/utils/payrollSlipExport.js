const ExcelJS = require('exceljs');
const {
  payrollCycleLabel,
  periodLabelCalendar,
  countWorkingDaysMonSatInCycle,
  cycleEndDate,
} = require('./payrollPeriod');

const EARNINGS = [
  { key: 'gaji_harian', label: 'Gaji Harian' },
  { key: 'tunjangan_jabatan', label: 'Tunjangan Jabatan' },
  { key: 'tunjangan_masa_kerja', label: 'Tunjangan Masa Kerja' },
  { key: 'tunjangan_transport', label: 'Tunjangan Transport' },
  { key: 'lembur', label: 'Lembur' },
  { key: 'insentif', label: 'Insentif' },
  { key: 'kerajinan', label: 'Kerajinan' },
  { key: 'bonus', label: 'Bonus' },
];

const DEDUCTIONS = [
  { key: 'bpjs_tk', label: 'BPJS Ketenagakerjaan' },
  { key: 'bpjs_kes', label: 'BPJS Kesehatan' },
  { key: 'pph21', label: 'PPh 21' },
  { key: 'kasbon', label: 'Potongan Pinjaman' },
  { key: 'potongan_lain', label: 'Potongan lain' },
];

/** Column layout (matches template): A label | B : | C value | D label | E : | F value */
const COL = { L_LABEL: 1, L_COLON: 2, L_VALUE: 3, R_LABEL: 4, R_COLON: 5, R_VALUE: 6 };
const ROW = {
  TITLE: 1,
  HEADER1: 2,
  HEADER2: 3,
  PERIODE: 4,
  SPACER_BEFORE_PERINCIAN: 5,
  PERINCIAN: 6,
  SPACER_AFTER_PERINCIAN: 7,
  TABLE_HEAD: 8,
  TABLE_FIRST: 9,
  TABLE_LAST: 16,
  SPACER_BEFORE_JUMLAH: 17,
  JUMLAH_HARI: 18,
  JUMLAH_HADIR: 19,
  SPACER_BEFORE_GAJI: 20,
  GAJI_TERIMA: 21,
  SIGN_TITLE: 25,
  SIGN_LINE: 30,
};
const SHEET_LAST_ROW = 30;
const SHEET_LAST_COL = 6;

const FONT_BODY = { name: 'Calibri', size: 11 };
const FONT_TITLE = { name: 'Calibri', size: 14, bold: true };
const FONT_TABLE_HEAD = { name: 'Calibri', size: 11, bold: true };
const FONT_NET = { name: 'Calibri', size: 11, bold: true };

const BORDER_MEDIUM = { style: 'medium', color: { argb: 'FF000000' } };
const BORDER_BLUE = { style: 'medium', color: { argb: 'FF4472C4' } };

function companyName() {
  return process.env.PAYROLL_COMPANY_NAME?.trim() || 'CV Harapan Jaya Sejahtera';
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatIdr(n) {
  return Number(n || 0).toLocaleString('id-ID');
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

function amountCell(n) {
  return num(n) > 0 ? formatIdr(n) : '-';
}

function periodLabel(period) {
  return periodLabelCalendar(period);
}

function periodLabelUpper(period) {
  return payrollCycleLabel(period, { upper: true });
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
  const transport = row.transport_eligible ? num(row.transport_allowance) : 0;
  const kerajinan = row.diligence_eligible ? num(row.diligence_bonus) : 0;
  const monthlyStaff = row.payroll_mode === 'monthly';
  const monthlyGross =
    row.monthly_basic_gross != null
      ? num(row.monthly_basic_gross)
      : num(row.employee_basic_salary);
  const absenceDeduction = monthlyStaff ? num(row.absence_deduction) : 0;

  return {
    gaji_harian: monthlyStaff ? monthlyGross : num(row.upah_harian),
    tunjangan_jabatan: 0,
    tunjangan_masa_kerja: num(row.tunjangan_masa_kerja),
    tunjangan_transport: transport,
    lembur: num(row.overtime_pay),
    insentif: num(row.insentif),
    kerajinan,
    bonus: num(row.bonus_omset),
    bpjs_tk: 0,
    bpjs_kes: 0,
    pph21: 0,
    kasbon: num(row.loan_deduction),
    potongan_lain: num(row.other_deductions) + absenceDeduction,
  };
}

function setCell(ws, row, col, value, opts = {}) {
  const cell = ws.getCell(row, col);
  cell.value = value ?? '';
  cell.font = { ...FONT_BODY, ...opts.font };
  if (opts.alignment) cell.alignment = opts.alignment;
}

function setColon(ws, row, col) {
  setCell(ws, row, col, ':', { alignment: { horizontal: 'center', vertical: 'middle' } });
}

function applyTableBorders(ws) {
  const { TABLE_HEAD, TABLE_LAST } = ROW;
  const { L_LABEL, L_VALUE, R_LABEL, R_VALUE } = COL;

  for (let r = TABLE_HEAD; r <= TABLE_LAST; r += 1) {
    for (let c = L_LABEL; c <= R_VALUE; c += 1) {
      ws.getCell(r, c).border = {};
    }
  }

  for (let r = TABLE_HEAD; r <= TABLE_LAST; r += 1) {
    ws.getCell(r, L_VALUE).border = {
      ...ws.getCell(r, L_VALUE).border,
      right: BORDER_MEDIUM,
    };
    ws.getCell(r, R_LABEL).border = {
      ...ws.getCell(r, R_LABEL).border,
      left: BORDER_MEDIUM,
    };
  }

  for (let c = L_LABEL; c <= R_VALUE; c += 1) {
    ws.getCell(TABLE_HEAD, c).border = {
      ...ws.getCell(TABLE_HEAD, c).border,
      top: BORDER_MEDIUM,
    };
    ws.getCell(TABLE_LAST, c).border = {
      ...ws.getCell(TABLE_LAST, c).border,
      bottom: BORDER_MEDIUM,
    };
  }

  for (let r = TABLE_HEAD; r <= TABLE_LAST; r += 1) {
    ws.getCell(r, L_LABEL).border = {
      ...ws.getCell(r, L_LABEL).border,
      left: BORDER_MEDIUM,
    };
    ws.getCell(r, R_VALUE).border = {
      ...ws.getCell(r, R_VALUE).border,
      right: BORDER_MEDIUM,
    };
  }
}

function applySheetOutline(ws) {
  for (let r = 1; r <= SHEET_LAST_ROW; r += 1) {
    for (let c = 1; c <= SHEET_LAST_COL; c += 1) {
      const cell = ws.getCell(r, c);
      const border = { ...(cell.border || {}) };
      if (r === 1) border.top = BORDER_BLUE;
      if (r === SHEET_LAST_ROW) border.bottom = BORDER_BLUE;
      if (c === 1) border.left = BORDER_BLUE;
      if (c === SHEET_LAST_COL) border.right = BORDER_BLUE;
      if (Object.keys(border).length) cell.border = border;
    }
  }
}

function setHeaderRow(ws, row, leftLabel, leftValue, rightLabel, rightValue) {
  const { L_LABEL, L_COLON, L_VALUE, R_LABEL, R_COLON, R_VALUE } = COL;
  setCell(ws, row, L_LABEL, leftLabel);
  setColon(ws, row, L_COLON);
  setCell(ws, row, L_VALUE, leftValue);
  setCell(ws, row, R_LABEL, rightLabel);
  setColon(ws, row, R_COLON);
  setCell(ws, row, R_VALUE, rightValue);
}

function addSpacerRow(ws, row) {
  ws.getRow(row).height = 15;
}

/** Blank row: no inner borders; outer blue box is applied later by applySheetOutline. */
function clearRowBorders(ws, row) {
  for (let c = 1; c <= SHEET_LAST_COL; c += 1) {
    ws.getCell(row, c).border = {};
  }
}

function fillTableLine(ws, row, labelCol, colonCol, valueCol, label, amount) {
  setCell(ws, row, labelCol, label);
  setCell(ws, row, colonCol, 'Rp.', { alignment: { horizontal: 'center', vertical: 'middle' } });
  setCell(ws, row, valueCol, amountCell(amount), {
    alignment: { horizontal: 'right', vertical: 'middle' },
  });
}

function addSlipSheet(wb, row, period, sheetName = 'Slip Gaji') {
  const ws = wb.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  ws.columns = [
    { width: 22 },
    { width: 3 },
    { width: 24 },
    { width: 22 },
    { width: 3 },
    { width: 18 },
  ];

  const amounts = slipAmounts(row);
  const { L_LABEL, L_COLON, L_VALUE, R_LABEL, R_COLON, R_VALUE } = COL;

  ws.mergeCells(ROW.TITLE, COL.L_LABEL, ROW.TITLE, COL.R_VALUE);
  const titleCell = ws.getCell(ROW.TITLE, COL.L_LABEL);
  titleCell.value = 'SLIP GAJI';
  titleCell.font = FONT_TITLE;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(ROW.TITLE).height = 22;

  setHeaderRow(
    ws,
    ROW.HEADER1,
    'Sudah terima dari',
    companyName(),
    'Nama',
    row.full_name || ''
  );
  setHeaderRow(
    ws,
    ROW.HEADER2,
    'Gaji Bulan',
    periodLabel(period),
    'Usia Kerja',
    computeUsiaKerja(row.join_date, slipAsOfDate(row, period))
  );

  setHeaderRow(
    ws,
    ROW.PERIODE,
    'Periode',
    payrollCycleLabel(period, { upper: true }),
    'Keterangan',
    row.keterangan || ''
  );
  ws.getRow(ROW.PERIODE).height = 18;

  addSpacerRow(ws, ROW.SPACER_BEFORE_PERINCIAN);

  setCell(ws, ROW.PERINCIAN, L_LABEL, 'Perincian');
  setColon(ws, ROW.PERINCIAN, L_COLON);

  addSpacerRow(ws, ROW.SPACER_AFTER_PERINCIAN);
  clearRowBorders(ws, ROW.SPACER_AFTER_PERINCIAN);

  ws.mergeCells(ROW.TABLE_HEAD, L_LABEL, ROW.TABLE_HEAD, L_VALUE);
  const gajiKotorHead = ws.getCell(ROW.TABLE_HEAD, L_LABEL);
  gajiKotorHead.value = 'Gaji Kotor';
  gajiKotorHead.font = FONT_TABLE_HEAD;
  gajiKotorHead.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(ROW.TABLE_HEAD, R_LABEL, ROW.TABLE_HEAD, R_VALUE);
  const potonganHead = ws.getCell(ROW.TABLE_HEAD, R_LABEL);
  potonganHead.value = 'Potongan';
  potonganHead.font = FONT_TABLE_HEAD;
  potonganHead.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(ROW.TABLE_HEAD).height = 18;

  for (let i = 0; i < EARNINGS.length; i += 1) {
    const r = ROW.TABLE_FIRST + i;
    const earning = EARNINGS[i];
    const earningLabel =
      earning.key === 'gaji_harian' && row.payroll_mode === 'monthly'
        ? 'Gaji Pokok Bulanan'
        : earning.label;
    fillTableLine(
      ws,
      r,
      L_LABEL,
      L_COLON,
      L_VALUE,
      earningLabel,
      amounts[earning.key]
    );
    ws.getRow(r).height = 17;

    if (i < DEDUCTIONS.length) {
      const deduction = DEDUCTIONS[i];
      fillTableLine(
        ws,
        r,
        R_LABEL,
        R_COLON,
        R_VALUE,
        deduction.label,
        amounts[deduction.key]
      );
    }
  }

  applyTableBorders(ws);

  addSpacerRow(ws, ROW.SPACER_BEFORE_JUMLAH);

  setCell(ws, ROW.JUMLAH_HARI, L_LABEL, 'Jumlah Hari');
  setCell(ws, ROW.JUMLAH_HARI, L_COLON, countWorkingDaysMonSat(period), {
    alignment: { horizontal: 'left', vertical: 'middle' },
  });

  setCell(ws, ROW.JUMLAH_HADIR, L_LABEL, 'Jumlah Hadir');
  setCell(ws, ROW.JUMLAH_HADIR, L_COLON, num(row.days_attended), {
    alignment: { horizontal: 'left', vertical: 'middle' },
  });

  addSpacerRow(ws, ROW.SPACER_BEFORE_GAJI);

  setCell(ws, ROW.GAJI_TERIMA, L_LABEL, 'Gaji Terima', { font: FONT_NET });
  setCell(ws, ROW.GAJI_TERIMA, R_COLON, 'Rp.', {
    font: FONT_NET,
    alignment: { horizontal: 'center', vertical: 'middle' },
  });
  setCell(ws, ROW.GAJI_TERIMA, R_VALUE, amountCell(row.final_salary), {
    font: FONT_NET,
    alignment: { horizontal: 'right', vertical: 'middle' },
  });
  ws.getRow(ROW.GAJI_TERIMA).height = 20;

  ws.mergeCells(ROW.SIGN_TITLE, L_LABEL, ROW.SIGN_TITLE, L_VALUE);
  const penerima = ws.getCell(ROW.SIGN_TITLE, L_LABEL);
  penerima.value = 'Penerima';
  penerima.alignment = { horizontal: 'center', vertical: 'bottom' };

  ws.mergeCells(ROW.SIGN_TITLE, R_LABEL, ROW.SIGN_TITLE, R_VALUE);
  const approver = ws.getCell(ROW.SIGN_TITLE, R_LABEL);
  approver.value = 'Disetujui Oleh';
  approver.alignment = { horizontal: 'center', vertical: 'bottom' };

  for (let r = ROW.SIGN_TITLE + 1; r < ROW.SIGN_LINE; r += 1) {
    ws.getRow(r).height = 16;
  }

  ws.mergeCells(ROW.SIGN_LINE, L_LABEL, ROW.SIGN_LINE, L_VALUE);
  const signLeft = ws.getCell(ROW.SIGN_LINE, L_LABEL);
  signLeft.value = '(                              )';
  signLeft.alignment = { horizontal: 'center', vertical: 'top' };

  ws.mergeCells(ROW.SIGN_LINE, R_LABEL, ROW.SIGN_LINE, R_VALUE);
  const signRight = ws.getCell(ROW.SIGN_LINE, R_LABEL);
  signRight.value = '(                              )';
  signRight.alignment = { horizontal: 'center', vertical: 'top' };
  ws.getRow(ROW.SIGN_LINE).height = 22;

  applySheetOutline(ws);

  return ws;
}

function sheetNameFromRow(row, index) {
  const base = String(row.employee_code || row.full_name || `Karyawan${index + 1}`)
    .replace(/[\\/*?:\[\]]/g, '_')
    .slice(0, 28);
  return base || `Slip${index + 1}`;
}

function slipWorkbookFromRows(rows, period) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Web-Based Attendance';
  const used = new Set();
  rows.forEach((row, i) => {
    let name = sheetNameFromRow(row, i);
    let n = 1;
    while (used.has(name)) {
      name = `${sheetNameFromRow(row, i).slice(0, 25)}_${++n}`;
    }
    used.add(name);
    addSlipSheet(wb, row, period, name);
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
  periodLabelUpper,
  computeUsiaKerja,
  countWorkingDaysMonSat,
  slipAmounts,
  employeeSlipExportFilename,
  addSlipSheet,
  buildEmployeeSlipWorkbook,
  slipWorkbookFromRows,
  writeSlipBuffer,
};
