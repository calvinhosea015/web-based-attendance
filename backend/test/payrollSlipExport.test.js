const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
  gridLayout,
  slipWorkbookFromRows,
  PANEL_ROWS,
  PANEL_COLS,
  BASE_SHEET_LAST_ROW,
} = require('../src/utils/payrollSlipExport');

describe('gridLayout', () => {
  it('uses one panel for a single employee', () => {
    assert.deepEqual(gridLayout(1), { cols: 1, rows: 1 });
  });

  it('tiles four employees in a 2x2 grid', () => {
    assert.deepEqual(gridLayout(4), { cols: 2, rows: 2 });
  });
});

describe('slipWorkbookFromRows', () => {
  const stubRow = (name, code) => ({
    full_name: name,
    employee_code: code || name,
    user_role: 'employee',
    payroll_mode: 'monthly',
    days_attended: 22,
    expected_work_days: 25,
    final_salary: 5_000_000,
    employee_basic_salary: 5_000_000,
    monthly_basic_gross: 5_000_000,
    transport_allowance: 0,
    diligence_bonus: 0,
    absence_deduction: 0,
    keterangan: '',
  });

  it('uses one worksheet with page breaks between full slips', async () => {
    const rows = [stubRow('Alpha', 'A01'), stubRow('Beta', 'B02')];
    const wb = slipWorkbookFromRows(rows, '2026-01');
    assert.equal(wb.worksheets.length, 1);

    const ws = wb.getWorksheet('Semua Slip');
    assert.ok(ws);
    assert.equal(ws.pageSetup.paperSize, 11);
    assert.equal(ws.pageSetup.orientation, 'portrait');
    assert.equal(ws.pageSetup.fitToPage, false);
    assert.equal(ws.pageSetup.printArea, undefined);
    assert.equal(ws.rowBreaks.length, 1);
    assert.equal(ws.rowBreaks[0].id, BASE_SHEET_LAST_ROW + 1);

    assert.ok(String(ws.getCell(1, 1).value).includes('Nama'));
    assert.equal(ws.getCell(BASE_SHEET_LAST_ROW + 1, 1).value, 'Nama');

    const buffer = await wb.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(buffer);
    assert.equal(loaded.worksheets.length, 1);
  });

  it('field officer slip has no RINCIAN block (same layout as staff)', async () => {
    const fieldRow = {
      full_name: 'ARI KHRISTANTO',
      user_role: 'field_officer',
      payroll_mode: 'daily',
      days_attended: 21,
      upah_harian: 75000,
      final_salary: 5_377_370,
      bonus_omset: 2_252_370,
      transport_allowance: 250_000,
      tunjangan_masa_kerja: 1_300_000,
      keterangan: '',
    };
    const wb = slipWorkbookFromRows([fieldRow], '2026-07');
    const ws = wb.getWorksheet('Semua Slip');
    let foundRincian = false;
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (String(cell.value || '').includes('RINCIAN PERHITUNGAN GAJI')) foundRincian = true;
      });
    });
    assert.equal(foundRincian, false);
    assert.equal(ws.lastRow.number, BASE_SHEET_LAST_ROW);
  });
});
