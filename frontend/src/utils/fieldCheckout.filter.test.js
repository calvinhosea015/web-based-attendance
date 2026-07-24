import assert from 'node:assert/strict';
import { filterDeliveryRecap, uniqueDeliveryFilterValues } from './fieldCheckout.js';

const rows = [
  {
    id: 1,
    full_name: 'Budi Santoso',
    employee_code: 'FO01',
    pabrik_code: 'PKA',
    kode_barang: 'B001',
  },
  {
    id: 2,
    full_name: 'Citra Lestari',
    employee_code: 'FO02',
    pabrik_code: 'PKB',
    kode_barang: 'B001',
  },
  {
    id: 3,
    full_name: 'Budi Santoso',
    employee_code: 'FO01',
    pabrik_code: 'PKA',
    kode_barang: 'B002',
  },
];

assert.deepEqual(uniqueDeliveryFilterValues(rows, 'pabrik_code'), ['PKA', 'PKB']);
assert.equal(filterDeliveryRecap(rows, {}).length, 3);
assert.equal(filterDeliveryRecap(rows, { pabrik: 'PKA' }).length, 2);
assert.equal(filterDeliveryRecap(rows, { officer: 'FO02' }).length, 1);
assert.equal(filterDeliveryRecap(rows, { kodeBarang: 'B001' }).length, 2);
assert.equal(
  filterDeliveryRecap(rows, { pabrik: 'PKA', officer: 'FO01', kodeBarang: 'B002' }).length,
  1
);
assert.equal(filterDeliveryRecap(rows, { pabrik: 'ZZZ' }).length, 0);

console.log('fieldCheckout.filter.test.js: ok');
