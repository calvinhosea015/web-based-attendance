const ExcelJS = require('exceljs');
const {
  payrollCycleLabel,
  periodLabelCalendar,
  countWorkingDaysMonSatInCycle,
  cycleEndDate,
} = require('./payrollPeriod');

/** Left column (Pendapatan) — matches Book1 slip template. */
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

const TABLE_LINE_COUNT = EARNINGS.length;

/** A label | B : / Rp. | C amount | D label | E Rp. | F amount */
const COL = { L_LABEL: 1, L_MID: 2, L_VALUE: 3, R_LABEL: 4, R_MID: 5, R_VALUE: 6 };
const ROW = {
  TITLE: 1,
  COMPANY: 2,
  NET_PAY: 3,
  GAJI_BULAN: 4,
  NAMA: 5,
  JABATAN: 6,
  USIA_KERJA: 7,
  SPACER_BEFORE_TABLE: 8,
  TABLE_HEAD: 9,
  TABLE_FIRST: 10,
  TABLE_LAST: 10 + TABLE_LINE_COUNT - 1,
  TABLE_TOTAL: 10 + TABLE_LINE_COUNT,
  JUMLAH_HARI: 11 + TABLE_LINE_COUNT,
  JUMLAH_HADIR: 12 + TABLE_LINE_COUNT,
  KETERANGAN_LABEL: 13 + TABLE_LINE_COUNT,
  KETERANGAN_VALUE_START: 14 + TABLE_LINE_COUNT,
  KETERANGAN_VALUE_END: 15 + TABLE_LINE_COUNT,
  SPACER_BEFORE_SIGN: 16 + TABLE_LINE_COUNT,
  SIGN_TITLE: 17 + TABLE_LINE_COUNT,
  SIGN_LINE: 22 + TABLE_LINE_COUNT,
};
const SHEET_LAST_ROW = ROW.SIGN_LINE;
const SHEET_LAST_COL = 6;

const FONT_KETERANGAN = { name: 'Calibri', size: 8 };
const FONT_BODY = { name: 'Calibri', size: 11 };
const FONT_TITLE = { name: 'Calibri', size: 14, bold: true };
const FONT_TABLE_HEAD = { name: 'Calibri', size: 13, bold: true };
const FONT_NET = { name: 'Calibri', size: 14, bold: true };

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
  return (
    row.position_title ||
    row.department_name ||
    row.jabatan ||
    ''
  );
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
  const { TABLE_HEAD, TABLE_LAST, TABLE_TOTAL } = ROW;
  const { L_LABEL, L_VALUE, R_LABEL, R_VALUE } = COL;

  for (let r = TABLE_HEAD; r <= TABLE_TOTAL; r += 1) {
    for (let c = L_LABEL; c <= R_VALUE; c += 1) {
      ws.getCell(r, c).border = {};
    }
  }

  for (let r = TABLE_HEAD; r <= TABLE_TOTAL; r += 1) {
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
    ws.getCell(TABLE_TOTAL, c).border = {
      ...ws.getCell(TABLE_TOTAL, c).border,
      bottom: BORDER_MEDIUM,
    };
  }

  for (let r = TABLE_HEAD; r <= TABLE_TOTAL; r += 1) {
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

function setLeftInfoRow(ws, row, label, value) {
  const { L_LABEL, L_MID, L_VALUE } = COL;
  setCell(ws, row, L_LABEL, label);
  setColon(ws, row, L_MID);
  setCell(ws, row, L_VALUE, value ?? '');
}

function addSpacerRow(ws, row) {
  ws.getRow(row).height = 15;
}

function clearRowBorders(ws, row) {
  for (let c = 1; c <= SHEET_LAST_COL; c += 1) {
    ws.getCell(row, c).border = {};
  }
}

function fillTableLine(ws, row, labelCol, midCol, valueCol, label, amount) {
  setCell(ws, row, labelCol, label);
  setCell(ws, row, midCol, 'Rp.', { alignment: { horizontal: 'center', vertical: 'middle' } });
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
  const totalPendapatan = sumAmountKeys(amounts, EARNINGS);
  const totalPotongan = sumAmountKeys(amounts, DEDUCTIONS);
  const netPay = num(row.final_salary) || Math.max(0, totalPendapatan - totalPotongan);
  const { L_LABEL, L_MID, L_VALUE, R_LABEL, R_MID, R_VALUE } = COL;

  ws.mergeCells(ROW.TITLE, COL.L_LABEL, ROW.TITLE, COL.R_VALUE);
  const titleCell = ws.getCell(ROW.TITLE, COL.L_LABEL);
  titleCell.value = 'SLIP GAJI';
  titleCell.font = FONT_TITLE;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(ROW.TITLE).height = 22;

  ws.mergeCells(ROW.COMPANY, COL.L_LABEL, ROW.COMPANY, COL.R_VALUE);
  const companyCell = ws.getCell(ROW.COMPANY, COL.L_LABEL);
  companyCell.value = companyName();
  companyCell.font = { ...FONT_BODY, bold: true };
  companyCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(ROW.COMPANY).height = 18;

  ws.mergeCells(ROW.NET_PAY, COL.L_LABEL, ROW.NET_PAY, COL.L_MID);
  const netLabel = ws.getCell(ROW.NET_PAY, COL.L_LABEL);
  netLabel.value = 'Total Penerimaan Bulan ini';
  netLabel.font = FONT_NET;
  netLabel.alignment = { horizontal: 'left', vertical: 'middle' };

  setCell(ws, ROW.NET_PAY, COL.R_MID, 'Rp.', {
    font: FONT_NET,
    alignment: { horizontal: 'center', vertical: 'middle' },
  });
  setCell(ws, ROW.NET_PAY, COL.R_VALUE, amountCell(netPay), {
    font: FONT_NET,
    alignment: { horizontal: 'right', vertical: 'middle' },
  });
  ws.getRow(ROW.NET_PAY).height = 20;

  setLeftInfoRow(ws, ROW.GAJI_BULAN, 'Gaji Bulan', periodLabelUpper(period));
  setLeftInfoRow(ws, ROW.NAMA, 'Nama', row.full_name || '');
  setLeftInfoRow(ws, ROW.JABATAN, 'Jabatan', jabatanLabel(row));
  setLeftInfoRow(
    ws,
    ROW.USIA_KERJA,
    'Usia Kerja',
    computeUsiaKerja(row.join_date, slipAsOfDate(row, period))
  );

  addSpacerRow(ws, ROW.SPACER_BEFORE_TABLE);
  clearRowBorders(ws, ROW.SPACER_BEFORE_TABLE);

  ws.mergeCells(ROW.TABLE_HEAD, COL.L_LABEL, ROW.TABLE_HEAD, COL.L_VALUE);
  const pendapatanHead = ws.getCell(ROW.TABLE_HEAD, COL.L_LABEL);
  pendapatanHead.value = 'Pendapatan';
  pendapatanHead.font = FONT_TABLE_HEAD;
  pendapatanHead.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(ROW.TABLE_HEAD, COL.R_LABEL, ROW.TABLE_HEAD, COL.R_VALUE);
  const potonganHead = ws.getCell(ROW.TABLE_HEAD, COL.R_LABEL);
  potonganHead.value = 'Potongan';
  potonganHead.font = FONT_TABLE_HEAD;
  potonganHead.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(ROW.TABLE_HEAD).height = 18;

  for (let i = 0; i < EARNINGS.length; i += 1) {
    const r = ROW.TABLE_FIRST + i;
    fillTableLine(ws, r, COL.L_LABEL, COL.L_MID, COL.L_VALUE, EARNINGS[i].label, amounts[EARNINGS[i].key]);
    if (i < DEDUCTIONS.length) {
      fillTableLine(
        ws,
        r,
        COL.R_LABEL,
        COL.R_MID,
        COL.R_VALUE,
        DEDUCTIONS[i].label,
        amounts[DEDUCTIONS[i].key]
      );
    }
    ws.getRow(r).height = 17;
  }

  const totalRow = ROW.TABLE_TOTAL;
  const totalFont = { ...FONT_BODY, bold: true };
  fillTableLine(ws, totalRow, COL.L_LABEL, COL.L_MID, COL.L_VALUE, 'Total Pendapatan', totalPendapatan);
  ws.getCell(totalRow, COL.L_LABEL).font = totalFont;
  ws.getCell(totalRow, COL.L_VALUE).font = totalFont;
  fillTableLine(ws, totalRow, COL.R_LABEL, COL.R_MID, COL.R_VALUE, 'Total Potongan', totalPotongan);
  ws.getCell(totalRow, COL.R_LABEL).font = totalFont;
  ws.getCell(totalRow, COL.R_VALUE).font = totalFont;
  ws.getRow(totalRow).height = 18;

  applyTableBorders(ws);

  setLeftInfoRow(ws, ROW.JUMLAH_HARI, 'Jumlah Hari', expectedWorkDaysForSlip(row, period));
  setLeftInfoRow(ws, ROW.JUMLAH_HADIR, 'Jumlah Hadir', num(row.days_attended));

  setCell(ws, ROW.KETERANGAN_LABEL, COL.L_LABEL, 'Keterangan');
  setColon(ws, ROW.KETERANGAN_LABEL, COL.L_MID);
  ws.mergeCells(
    ROW.KETERANGAN_VALUE_START,
    COL.L_VALUE,
    ROW.KETERANGAN_VALUE_END,
    COL.R_VALUE
  );
  const ketCell = ws.getCell(ROW.KETERANGAN_VALUE_START, COL.L_VALUE);
  ketCell.value = row.keterangan || '';
  ketCell.font = FONT_KETERANGAN;
  ketCell.alignment = { vertical: 'top', wrapText: true };
  ws.getRow(ROW.KETERANGAN_VALUE_START).height = 28;
  ws.getRow(ROW.KETERANGAN_VALUE_END).height = 28;

  addSpacerRow(ws, ROW.SPACER_BEFORE_SIGN);
  clearRowBorders(ws, ROW.SPACER_BEFORE_SIGN);

  ws.mergeCells(ROW.SIGN_TITLE, COL.L_LABEL, ROW.SIGN_TITLE, COL.L_VALUE);
  ws.getCell(ROW.SIGN_TITLE, COL.L_LABEL).value = 'Penerima';
  ws.getCell(ROW.SIGN_TITLE, COL.L_LABEL).alignment = { horizontal: 'center', vertical: 'bottom' };

  ws.mergeCells(ROW.SIGN_TITLE, COL.R_LABEL, ROW.SIGN_TITLE, COL.R_VALUE);
  ws.getCell(ROW.SIGN_TITLE, COL.R_LABEL).value = 'Disetujui Oleh';
  ws.getCell(ROW.SIGN_TITLE, COL.R_LABEL).alignment = { horizontal: 'center', vertical: 'bottom' };

  for (let r = ROW.SIGN_TITLE + 1; r < ROW.SIGN_LINE; r += 1) {
    ws.getRow(r).height = 16;
  }

  ws.mergeCells(ROW.SIGN_LINE, COL.L_LABEL, ROW.SIGN_LINE, COL.L_VALUE);
  ws.getCell(ROW.SIGN_LINE, COL.L_LABEL).value = '(                              )';
  ws.getCell(ROW.SIGN_LINE, COL.L_LABEL).alignment = { horizontal: 'center', vertical: 'top' };

  ws.mergeCells(ROW.SIGN_LINE, COL.R_LABEL, ROW.SIGN_LINE, COL.R_VALUE);
  ws.getCell(ROW.SIGN_LINE, COL.R_LABEL).value = '(                              )';
  ws.getCell(ROW.SIGN_LINE, COL.R_LABEL).alignment = { horizontal: 'center', vertical: 'top' };
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
