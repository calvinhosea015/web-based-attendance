import assert from 'node:assert/strict';
import {
  filterDeliveryRecap,
  groupFieldDeliveriesByFactoryItem,
  uniqueDeliveryFilterValues,
} from './fieldCheckout.js';

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

const grouped = groupFieldDeliveriesByFactoryItem([
  {
    pabrik_code: 'PKA',
    nama_pabrik: 'Pabrik A',
    kode_barang: 'B001',
    nama_barang: 'Cangkang',
    berat_bersih: 100,
    bonus_amount: 2000,
    omset_amount: 100000,
  },
  {
    pabrik_code: 'PKA',
    kode_barang: 'B001',
    berat_bersih: 50.5,
    bonus_amount: 1010,
    omset_amount: 50500,
  },
  {
    pabrik_code: 'PKB',
    nama_pabrik: 'Pabrik B',
    kode_barang: 'B002',
    berat_bersih: 80,
    bonus_amount: 1600,
    omset_amount: 80000,
  },
]);

assert.equal(grouped.length, 2);
assert.equal(grouped[0].pabrik_code, 'PKA');
assert.equal(grouped[0].items.length, 1);
assert.equal(grouped[0].items[0].delivery_count, 2);
assert.equal(grouped[0].items[0].total_berat_bersih, 150.5);
assert.equal(grouped[0].items[0].total_bonus, 3010);
assert.equal(grouped[0].total_berat_bersih, 150.5);
assert.equal(grouped[1].pabrik_code, 'PKB');
assert.equal(grouped[1].items[0].kode_barang, 'B002');
assert.equal(grouped[1].total_bonus, 1600);

console.log('fieldCheckout.filter.test.js: ok');
