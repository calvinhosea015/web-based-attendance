const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeTunjanganMasaKerja,
  receivesTunjanganMasaKerja,
  resolveTunjanganMasaKerjaForRole,
  TUNJANGAN_MASA_KERJA_MAX,
} = require('../src/utils/tenureAllowance');

describe('tunjangan masa kerja cap', () => {
  it('pays 100,000 per completed year below the cap', () => {
    assert.equal(computeTunjanganMasaKerja('2016-06-27', '2026-06-27'), 1_000_000); // 10 years
  });

  it('caps at 1,500,000 at exactly 15 years', () => {
    assert.equal(computeTunjanganMasaKerja('2011-06-27', '2026-06-27'), TUNJANGAN_MASA_KERJA_MAX);
  });

  it('stays fixed at 1,500,000 beyond 15 years', () => {
    assert.equal(computeTunjanganMasaKerja('2000-01-01', '2026-06-27'), TUNJANGAN_MASA_KERJA_MAX);
  });
});

describe('tunjangan masa kerja by role', () => {
  it('excludes Staff Kantor', () => {
    assert.equal(receivesTunjanganMasaKerja('employee'), false);
    assert.equal(resolveTunjanganMasaKerjaForRole('employee', '2016-06-27', '2026-06'), 0);
  });

  it('includes Accounting and field officer', () => {
    assert.equal(receivesTunjanganMasaKerja('accounting'), true);
    assert.equal(receivesTunjanganMasaKerja('field_officer'), true);
    assert.equal(receivesTunjanganMasaKerja('general_affairs'), true);
  });
});
