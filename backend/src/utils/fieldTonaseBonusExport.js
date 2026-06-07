const ExcelJS = require('exceljs');

const FONT_HEAD = { name: 'Calibri', size: 11, bold: true };
const FONT_BODY = { name: 'Calibri', size: 11 };
const FONT_TITLE = { name: 'Calibri', size: 14, bold: true };
const AMOUNT_NUMFMT = '#,##0.00';
const COUNT_NUMFMT = '#,##0';

function companyName() {
  return process.env.PAYROLL_COMPANY_NAME?.trim() || 'CV Harapan Jaya Sejahtera';
}

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = FONT_HEAD;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
}

function addTitleRow(sheet, title, dateFrom, dateTo) {
  sheet.mergeCells(1, 1, 1, 8);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = FONT_TITLE;

  sheet.mergeCells(2, 1, 2, 8);
  const subCell = sheet.getCell(2, 1);
  subCell.value = `${companyName()} · ${dateFrom} – ${dateTo}`;
  subCell.font = FONT_BODY;
}

function buildSummarySheet(sheet, summaryRows, dateFrom, dateTo) {
  addTitleRow(sheet, 'Tonase bonus — ringkasan per pabrik & kode barang', dateFrom, dateTo);
  const headers = [
    'Kode pabrik',
    'Nama pabrik',
    'Kode barang',
    'Tonase per item',
    'Jumlah pengiriman',
    'Total selisih (kg)',
    'Total omset',
    'Total bonus',
  ];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  let totalDeliveries = 0;
  let totalOmset = 0;
  let totalBonus = 0;
  for (const row of summaryRows) {
    totalDeliveries += Number(row.delivery_count) || 0;
    totalOmset += Number(row.total_omset) || 0;
    totalBonus += Number(row.total_bonus) || 0;
    const dataRow = sheet.addRow([
      row.pabrik_code,
      row.nama_pabrik,
      row.kode_barang,
      Number(row.tonase_per_item) || 0,
      Number(row.delivery_count) || 0,
      Number(row.total_selisih) || 0,
      Number(row.total_omset) || 0,
      Number(row.total_bonus) || 0,
    ]);
    dataRow.getCell(4).numFmt = AMOUNT_NUMFMT;
    dataRow.getCell(5).numFmt = COUNT_NUMFMT;
    dataRow.getCell(6).numFmt = AMOUNT_NUMFMT;
    dataRow.getCell(7).numFmt = AMOUNT_NUMFMT;
    dataRow.getCell(8).numFmt = AMOUNT_NUMFMT;
  }

  const totalRow = sheet.addRow([
    'TOTAL',
    '',
    '',
    '',
    totalDeliveries,
    '',
    Math.round(totalOmset * 100) / 100,
    Math.round(totalBonus * 100) / 100,
  ]);
  totalRow.eachCell((cell) => {
    cell.font = FONT_HEAD;
  });
  totalRow.getCell(5).numFmt = COUNT_NUMFMT;
  totalRow.getCell(7).numFmt = AMOUNT_NUMFMT;
  totalRow.getCell(8).numFmt = AMOUNT_NUMFMT;

  sheet.columns = [
    { width: 12 },
    { width: 28 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
  ];
}

function buildDetailSheet(sheet, deliveries, dateFrom, dateTo) {
  addTitleRow(sheet, 'Tonase bonus — detail pengiriman', dateFrom, dateTo);
  const headers = [
    'Tanggal',
    'Petugas',
    'Kode karyawan',
    'Kode pabrik',
    'Nama pabrik',
    'Kode barang',
    'Tonase per item',
    'Kotor (kg)',
    'Berat bersih (kg)',
    'Selisih (kg)',
    'Omset',
    'Bonus',
    'Norek',
    'No. tanda terima',
    'No. surat jalan',
    'Nopol',
    'No. BS',
  ];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  for (const row of deliveries) {
    const dataRow = sheet.addRow([
      row.valid_on,
      row.full_name,
      row.employee_code,
      row.pabrik_code,
      row.nama_pabrik || '',
      row.kode_barang,
      Number(row.tonase_per_item) || 0,
      Number(row.kotor) || 0,
      Number(row.berat_bersih) || 0,
      Number(row.selisih) || 0,
      Number(row.omset_amount) || 0,
      Number(row.bonus_amount) || 0,
      row.norek,
      row.nomor_tanda_terima,
      row.nomor_surat_jalan,
      row.nopol,
      row.no_bs,
    ]);
    for (const col of [7, 8, 9, 10, 11, 12]) {
      dataRow.getCell(col).numFmt = AMOUNT_NUMFMT;
    }
  }

  sheet.columns = [
    { width: 12 },
    { width: 22 },
    { width: 14 },
    { width: 12 },
    { width: 24 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 16 },
    { width: 16 },
    { width: 12 },
    { width: 10 },
  ];
}

function exportFilename(dateFrom, dateTo) {
  return `tonase_bonus_${dateFrom}_${dateTo}.xlsx`;
}

async function buildFieldTonaseBonusWorkbook({ summaryRows, deliveries, dateFrom, dateTo }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = companyName();
  wb.created = new Date();

  const summarySheet = wb.addWorksheet('Ringkasan');
  buildSummarySheet(summarySheet, summaryRows, dateFrom, dateTo);

  const detailSheet = wb.addWorksheet('Detail');
  buildDetailSheet(detailSheet, deliveries, dateFrom, dateTo);

  return wb;
}

async function writeFieldTonaseBonusBuffer(workbook) {
  return workbook.xlsx.writeBuffer();
}

module.exports = {
  buildFieldTonaseBonusWorkbook,
  writeFieldTonaseBonusBuffer,
  exportFilename,
};
