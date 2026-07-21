const { test } = require('node:test');
const assert = require('node:assert/strict');
const { slipWorkbookFromRows } = require('../src/utils/payrollSlipExport');

function mockSlipRow(name) {
  return {
    full_name: name,
    employee_code: name.replace(/\s/g, '').slice(0, 6),
    user_role: 'employee',
    payroll_mode: 'monthly',
    monthly_basic_gross: 5_000_000,
    days_attended: 22,
    expected_work_days: 25,
    final_salary: 4_500_000,
    absence_deduction: 0,
    keterangan: '',
  };
}

test('export all slips: one worksheet, stacked blocks, page break every two slips', () => {
  const rows = [mockSlipRow('Alpha'), mockSlipRow('Beta'), mockSlipRow('Gamma')];
  const wb = slipWorkbookFromRows(rows, '2025-06');
  assert.equal(wb.worksheets.length, 1);
  assert.equal(wb.worksheets[0].name, 'Slip Gaji');
  assert.equal(wb.worksheets[0].pageSetup.paperSize, 9);
  assert.equal(wb.worksheets[0].pageSetup.orientation, 'portrait');
  assert.equal(wb.worksheets[0].getCell(1, 2).value, 'Alpha');
  assert.equal(wb.worksheets[0].getCell(23, 2).value, 'Beta');
  assert.equal(wb.worksheets[0].getCell(45, 2).value, 'Gamma');
});
