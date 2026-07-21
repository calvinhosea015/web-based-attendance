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

  it('tiles four employees in a 2x2 grid', () => {
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

  it('creates one sheet per employee, each A5 landscape', async () => {
    const rows = [stubRow('Alpha', 'A01'), stubRow('Beta', 'B02'), stubRow('Gamma', 'C03')];
    const wb = slipWorkbookFromRows(rows, '2026-01');
    assert.equal(wb.worksheets.length, 3);

    for (const ws of wb.worksheets) {
      assert.equal(ws.pageSetup.paperSize, 11);
      assert.equal(ws.pageSetup.orientation, 'landscape');
      assert.equal(ws.pageSetup.margins.top, 1);
      assert.equal(ws.pageSetup.margins.left, 0);
      assert.equal(ws.pageSetup.margins.right, 0);
      assert.equal(ws.pageSetup.margins.bottom, 0);
      assert.equal(ws.pageSetup.margins.header, 0.5);
      assert.equal(ws.pageSetup.margins.footer, 0.5);
    }

    const buffer = await wb.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(buffer);
    assert.equal(loaded.worksheets.length, 3);
  });
});
