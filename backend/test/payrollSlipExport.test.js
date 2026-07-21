const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
  gridLayout,
  slipWorkbookFromRows,
  PANEL_ROWS,
  PANEL_COLS,
} = require('../src/utils/payrollSlipExport');

describe('gridLayout', () => {
  it('uses one panel for a single employee', () => {
    assert.deepEqual(gridLayout(1), { cols: 1, rows: 1 });
  });

  it('tiles four employees in a 2×2 grid', () => {
    assert.deepEqual(gridLayout(4), { cols: 2, rows: 2 });
  });

  it('covers every employee in the grid', () => {
    for (const n of [2, 3, 5, 6, 7, 9, 10]) {
      const { cols, rows } = gridLayout(n);
      assert.ok(cols * rows >= n);
    }
  });
});

describe('slipWorkbookFromRows', () => {
  const stubRow = (name) => ({
    full_name: name,
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

  it('puts multiple employees on one worksheet sized for A5 print', async () => {
    const wb = slipWorkbookFromRows(
      [stubRow('Alpha'), stubRow('Beta'), stubRow('Gamma'), stubRow('Delta')],
      '2026-01'
    );
    assert.equal(wb.worksheets.length, 1);
    const ws = wb.getWorksheet('Semua Slip');
    assert.ok(ws);
    assert.equal(ws.pageSetup.paperSize, 11);
    assert.equal(ws.pageSetup.fitToHeight, 1);
    const { cols, rows } = gridLayout(4);
    assert.equal(ws.pageSetup.printArea, `A1:H${rows * PANEL_ROWS}`);
    assert.equal(ws.columnCount, cols * PANEL_COLS);

    const buffer = await wb.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(buffer);
    assert.equal(loaded.worksheets.length, 1);
    const again = loaded.getWorksheet('Semua Slip');
    assert.ok(String(again.getCell(1, 1).value).includes('Alpha'));
    assert.ok(String(again.getCell(PANEL_ROWS + 1, 1).value).includes('Gamma'));
  });
});
