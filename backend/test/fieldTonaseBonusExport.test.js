const assert = require('node:assert/strict');
const {
  buildFieldTonaseBonusWorkbook,
} = require('../src/utils/fieldTonaseBonusExport');

async function main() {
  const wb = await buildFieldTonaseBonusWorkbook({
    dateFrom: '2026-06-25',
    dateTo: '2026-07-24',
    summaryRows: [
      {
        pabrik_code: '1',
        nama_pabrik: 'Pabrik Satu',
        kode_barang: 'B01',
        nama_barang: 'Cangkang',
        price_per_item: 1000,
        delivery_count: 2,
        total_berat_bersih: 150.5,
        total_omset: 150500,
        total_bonus: 3010,
      },
    ],
    deliveries: [],
  });

  const sheet = wb.getWorksheet('Ringkasan');
  assert.ok(sheet);
  const headers = sheet.getRow(3).values.slice(1);
  assert.ok(headers.includes('Total berat bersih (kg)'));
  assert.ok(headers.includes('Total bonus'));
  assert.ok(!headers.includes('Total selisih (kg)'));

  const data = sheet.getRow(4).values.slice(1);
  assert.equal(data[6], 150.5);
  assert.equal(data[8], 3010);

  console.log('fieldTonaseBonusExport.test.js: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
