const ExcelJS = require('exceljs');
const {
  payrollCycleLabel,
  periodLabelCalendar,
  countWorkingDaysMonSatInCycle,
  cycleEndDate,
} = require('./payrollPeriod');

/** Left column (Pendapatan) — matches company slip template. */
const EARNINGS = [
  { key: 'gaji', label: 'Gaji' },
  { key: 'tunjangan_masa_kerja', label: 'Tunjangan Masa Kerja' },
  { key: 'tunjangan_transport', label: 'Tunjangan Transport' },
  { key: 'lembur', label: 'Lembur' },
  { key: 'insentif', label: 'Insentif' },
  { key: 'kerajinan', label: 'Kerajinan' },
  { key: 'bonus', label: 'Bonus' },
];

/** Right column (Potongan) */
const DEDUCTIONS = [
  { key: 'potongan_absen', label: 'Potongan Absen' },
  { key: 'potongan_terlambat', label: 'Potongan Datang Terlambat' },
  { key: 'bpjs_tk', label: 'BPJS Ketenagakerjaan' },
  { key: 'bpjs_kes', label: 'BPJS Kesehatan' },
  { key: 'pph21', label: 'PPh 21' },
  { key: 'kasbon', label: 'Kasbon' },
  { key: 'potongan_lain', label: 'Potongan lain' },
];

/** A label | B amount | C label | D amount (matches company slip template). */
const COL = { L_LABEL: 1, L_AMOUNT: 2, R_LABEL: 3, R_AMOUNT: 4 };

/** Fixed row numbers aligned with the Excel template (rows 7–13 = line items, 17–18 = keterangan). */
const ROW = {
  GAJI_BULAN: 1,
  NAMA: 2,
  JABATAN: 3,
  USIA_KERJA: 4,
  SPACER: 5,
  TABLE_HEAD: 6,
  TABLE_FIRST: 7,
  TABLE_LAST: 13,
  TABLE_TOTAL: 14,
  JUMLAH_HARI: 15,
  JUMLAH_HADIR: 16,
  KETERANGAN_VALUE_START: 17,
  KETERANGAN_VALUE_END: 18,
  SPACER_BEFORE_NET: 19,
  NET_PAY: 20,
  SIGN_TITLE: 21,
  SIGN_LINE: 26,
};
const SHEET_LAST_ROW = ROW.SIGN_LINE;
const SHEET_LAST_COL = 4;

const FONT_KETERANGAN = { name: 'Calibri', size: 8 };
const FONT_BODY = { name: 'Calibri', size: 11 };
const FONT_TITLE = { name: 'Calibri', size: 16, bold: true };
const FONT_COMPANY = { name: 'Calibri', size: 11, bold: true };
const FONT_TABLE_HEAD = { name: 'Calibri', size: 11, bold: true };
const FONT_NET = { name: 'Calibri', size: 11, bold: true };

const BORDER_THIN = { style: 'thin', color: { argb: 'FF000000' } };
const BORDER_MEDIUM = { style: 'medium', color: { argb: 'FF000000' } };
const AMOUNT_NUMFMT = '"Rp "#,##0;"- "';

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
  const transport = row.transport_eligible ? num(row.transport_allowance) : 0;
  const kerajinan = row.diligence_eligible ? num(row.diligence_bonus) : 0;
  const monthlyStaff =
    row.payroll_mode === 'monthly' || row.payroll_mode === 'general_affairs';
  const monthlyGross =
    row.monthly_basic_gross != null
      ? num(row.monthly_basic_gross)
      : num(row.employee_basic_salary);
  const absenceDeduction = monthlyStaff ? num(row.absence_deduction) : 0;

  let gajiLine;
  if (monthlyStaff) {
    gajiLine = monthlyGross;
  } else if (row.payroll_mode === 'accounting' || row.payroll_mode === 'manual') {
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
    bpjs_tk: 0,
    bpjs_kes: 0,
    pph21: 0,
    kasbon: num(row.loan_deduction),
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
  return row.position_title || row.department_name || row.jabatan || '';
}

function periodLabel(period) {
  return periodLabelCalendar(period);
}

function periodLabelUpper(period) {
  return payrollCycleLabel(period, { upper: true });
}

/** "JUNI 2026" for Gaji Bulan field on the slip header. */
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

function setAmountCell(ws, row, col, amount) {
  const cell = ws.getCell(row, col);
  const n = num(amount);
  if (n > 0) {
    cell.value = n;
    cell.numFmt = AMOUNT_NUMFMT;
  } else {
    cell.value = '-';
    cell.font = FONT_BODY;
  }
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
}

function setInfoRow(ws, row, label, value) {
  setCell(ws, row, COL.L_LABEL, `${label} :`);
  setCell(ws, row, COL.L_AMOUNT, value ?? '', {
    alignment: { horizontal: 'left', vertical: 'middle' },
  });
}

function applyTableBorders(ws) {
  const { TABLE_HEAD, TABLE_TOTAL } = ROW;
  const { L_LABEL, L_AMOUNT, R_LABEL, R_AMOUNT } = COL;

  for (let r = TABLE_HEAD; r <= TABLE_TOTAL; r += 1) {
    for (let c = L_LABEL; c <= R_AMOUNT; c += 1) {
      const cell = ws.getCell(r, c);
      cell.border = {
        top: BORDER_THIN,
        left: BORDER_THIN,
        bottom: BORDER_THIN,
        right: BORDER_THIN,
      };
    }
  }

  for (let r = TABLE_HEAD; r <= TABLE_TOTAL; r += 1) {
    ws.getCell(r, L_AMOUNT).border = {
      ...ws.getCell(r, L_AMOUNT).border,
      right: BORDER_MEDIUM,
    };
    ws.getCell(r, R_LABEL).border = {
      ...ws.getCell(r, R_LABEL).border,
      left: BORDER_MEDIUM,
    };
  }
}

function fillTableLine(ws, row, labelCol, amountCol, label, amount) {
  setCell(ws, row, labelCol, label);
  setAmountCell(ws, row, amountCol, amount);
  ws.getRow(row).height = 17;
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
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  ws.columns = [
    { width: 26 },
    { width: 16 },
    { width: 28 },
    { width: 16 },
  ];

  const amounts = slipAmounts(row);
  const totalPendapatan = sumAmountKeys(amounts, EARNINGS);
  const totalPotongan = sumAmountKeys(amounts, DEDUCTIONS);
  const netPay = num(row.final_salary) || Math.max(0, totalPendapatan - totalPotongan);
  const lAmt = colLetter(COL.L_AMOUNT);
  const rAmt = colLetter(COL.R_AMOUNT);

  setInfoRow(ws, ROW.GAJI_BULAN, 'Gaji Bulan', gajiBulanLabel(period));
  setInfoRow(ws, ROW.NAMA, 'Nama', row.full_name || '');
  setInfoRow(ws, ROW.JABATAN, 'Jabatan', jabatanLabel(row));
  setInfoRow(
    ws,
    ROW.USIA_KERJA,
    'Usia Kerja',
    computeUsiaKerja(row.join_date, slipAsOfDate(row, period))
  );
  ws.getRow(ROW.GAJI_BULAN).height = 18;
  ws.getRow(ROW.NAMA).height = 18;
  ws.getRow(ROW.JABATAN).height = 18;
  ws.getRow(ROW.USIA_KERJA).height = 18;

  ws.mergeCells(ROW.GAJI_BULAN, COL.R_LABEL, ROW.GAJI_BULAN, COL.R_AMOUNT);
  const titleCell = ws.getCell(ROW.GAJI_BULAN, COL.R_LABEL);
  titleCell.value = 'SLIP GAJI';
  titleCell.font = FONT_TITLE;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(ROW.NAMA, COL.R_LABEL, ROW.NAMA, COL.R_AMOUNT);
  const companyCell = ws.getCell(ROW.NAMA, COL.R_LABEL);
  companyCell.value = companyName();
  companyCell.font = FONT_COMPANY;
  companyCell.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getRow(ROW.SPACER).height = 8;

  ws.mergeCells(ROW.TABLE_HEAD, COL.L_LABEL, ROW.TABLE_HEAD, COL.L_AMOUNT);
  const pendapatanHead = ws.getCell(ROW.TABLE_HEAD, COL.L_LABEL);
  pendapatanHead.value = 'Pendapatan';
  pendapatanHead.font = FONT_TABLE_HEAD;
  pendapatanHead.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(ROW.TABLE_HEAD, COL.R_LABEL, ROW.TABLE_HEAD, COL.R_AMOUNT);
  const potonganHead = ws.getCell(ROW.TABLE_HEAD, COL.R_LABEL);
  potonganHead.value = 'Potongan';
  potonganHead.font = FONT_TABLE_HEAD;
  potonganHead.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(ROW.TABLE_HEAD).height = 18;

  for (let i = 0; i < EARNINGS.length; i += 1) {
    const r = ROW.TABLE_FIRST + i;
    fillTableLine(ws, r, COL.L_LABEL, COL.L_AMOUNT, EARNINGS[i].label, amounts[EARNINGS[i].key]);
    if (i < DEDUCTIONS.length) {
      fillTableLine(
        ws,
        r,
        COL.R_LABEL,
        COL.R_AMOUNT,
        DEDUCTIONS[i].label,
        amounts[DEDUCTIONS[i].key]
      );
    }
  }

  const totalRow = ROW.TABLE_TOTAL;
  const totalFont = { ...FONT_BODY, bold: true };
  setCell(ws, totalRow, COL.L_LABEL, 'Total Pendapatan', { font: totalFont });
  const leftTotal = ws.getCell(totalRow, COL.L_AMOUNT);
  leftTotal.value = {
    formula: `SUM(${lAmt}${ROW.TABLE_FIRST}:${lAmt}${ROW.TABLE_LAST})`,
    result: totalPendapatan,
  };
  leftTotal.numFmt = AMOUNT_NUMFMT;
  leftTotal.font = totalFont;
  leftTotal.alignment = { horizontal: 'right', vertical: 'middle' };

  setCell(ws, totalRow, COL.R_LABEL, 'Total Potongan', { font: totalFont });
  const rightTotal = ws.getCell(totalRow, COL.R_AMOUNT);
  rightTotal.value = {
    formula: `SUM(${rAmt}${ROW.TABLE_FIRST}:${rAmt}${ROW.TABLE_LAST})`,
    result: totalPotongan,
  };
  rightTotal.numFmt = AMOUNT_NUMFMT;
  rightTotal.font = totalFont;
  rightTotal.alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getRow(totalRow).height = 18;

  applyTableBorders(ws);

  setInfoRow(ws, ROW.JUMLAH_HARI, 'Jumlah Hari', expectedWorkDaysForSlip(row, period));
  setInfoRow(ws, ROW.JUMLAH_HADIR, 'Jumlah Hadir', num(row.days_attended));
  ws.getRow(ROW.JUMLAH_HARI).height = 18;
  ws.getRow(ROW.JUMLAH_HADIR).height = 18;

  setCell(ws, ROW.JUMLAH_HARI, COL.R_LABEL, 'Keterangan :');

  ws.mergeCells(
    ROW.KETERANGAN_VALUE_START,
    COL.R_LABEL,
    ROW.KETERANGAN_VALUE_END,
    COL.R_AMOUNT
  );
  const ketCell = ws.getCell(ROW.KETERANGAN_VALUE_START, COL.R_LABEL);
  ketCell.value = row.keterangan || '';
  ketCell.font = FONT_KETERANGAN;
  ketCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  ws.getRow(ROW.KETERANGAN_VALUE_START).height = 32;
  ws.getRow(ROW.KETERANGAN_VALUE_END).height = 32;
  ws.getRow(ROW.SPACER_BEFORE_NET).height = 10;

  const netLabel = ws.getCell(ROW.NET_PAY, COL.R_LABEL);
  netLabel.value = 'Total Penerimaan Bulan ini';
  netLabel.font = FONT_NET;
  netLabel.alignment = { horizontal: 'right', vertical: 'middle' };

  const netAmount = ws.getCell(ROW.NET_PAY, COL.R_AMOUNT);
  netAmount.value = {
    formula: `${lAmt}${totalRow}-${rAmt}${totalRow}`,
    result: netPay,
  };
  netAmount.numFmt = AMOUNT_NUMFMT;
  netAmount.font = FONT_NET;
  netAmount.alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getRow(ROW.NET_PAY).height = 22;

  ws.mergeCells(ROW.SIGN_TITLE, COL.L_LABEL, ROW.SIGN_TITLE, COL.L_AMOUNT);
  ws.getCell(ROW.SIGN_TITLE, COL.L_LABEL).value = 'Penerima';
  ws.getCell(ROW.SIGN_TITLE, COL.L_LABEL).alignment = { horizontal: 'center', vertical: 'bottom' };

  ws.mergeCells(ROW.SIGN_TITLE, COL.R_LABEL, ROW.SIGN_TITLE, COL.R_AMOUNT);
  ws.getCell(ROW.SIGN_TITLE, COL.R_LABEL).value = 'Disetujui Oleh';
  ws.getCell(ROW.SIGN_TITLE, COL.R_LABEL).alignment = { horizontal: 'center', vertical: 'bottom' };

  for (let r = ROW.SIGN_TITLE + 1; r < ROW.SIGN_LINE; r += 1) {
    ws.getRow(r).height = 16;
  }

  ws.mergeCells(ROW.SIGN_LINE, COL.L_LABEL, ROW.SIGN_LINE, COL.L_AMOUNT);
  ws.getCell(ROW.SIGN_LINE, COL.L_LABEL).value = '(                              )';
  ws.getCell(ROW.SIGN_LINE, COL.L_LABEL).alignment = { horizontal: 'center', vertical: 'top' };

  ws.mergeCells(ROW.SIGN_LINE, COL.R_LABEL, ROW.SIGN_LINE, COL.R_AMOUNT);
  ws.getCell(ROW.SIGN_LINE, COL.R_LABEL).value = '(                              )';
  ws.getCell(ROW.SIGN_LINE, COL.R_LABEL).alignment = { horizontal: 'center', vertical: 'top' };
  ws.getRow(ROW.SIGN_LINE).height = 22;

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
  gajiBulanLabel,
  computeUsiaKerja,
  countWorkingDaysMonSat,
  slipAmounts,
  employeeSlipExportFilename,
  addSlipSheet,
  buildEmployeeSlipWorkbook,
  slipWorkbookFromRows,
  writeSlipBuffer,
};
