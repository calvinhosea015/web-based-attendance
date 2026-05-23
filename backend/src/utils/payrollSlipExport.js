const XLSX = require('xlsx');

const ID_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function formatIdr(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

function periodLabel(period) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period || ''));
  if (!m) return period;
  const month = Number(m[2]);
  const year = Number(m[1]);
  if (month >= 1 && month <= 12) return `${ID_MONTHS[month - 1]} ${year}`;
  return period;
}

function yesNo(flag) {
  return flag ? 'Ya' : 'Tidak';
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Build array-of-arrays for one employee slip. */
function buildSlipAoa(row, period) {
  const days = num(row.days_attended);
  const upah = num(row.upah_harian);
  const gajiPokok = num(row.basic_salary);
  const transport = row.transport_eligible ? num(row.transport_allowance) : 0;
  const kerajinan = row.diligence_eligible ? num(row.diligence_bonus) : 0;

  return [
    ['SLIP GAJI', ''],
    ['Periode', periodLabel(period)],
    [''],
    ['Nama', row.full_name || '—'],
    ['ID Karyawan', row.employee_code || '—'],
    [''],
    ['Rincian penghasilan', ''],
    ['Hari kerja', days],
    ['Upah harian (Rp)', formatIdr(upah)],
    ['Gaji pokok (hari × upah)', formatIdr(gajiPokok)],
    ['Tunjangan masa kerja', formatIdr(row.tunjangan_masa_kerja)],
    ['Tunjangan transport', `${yesNo(row.transport_eligible)} — ${formatIdr(transport)}`],
    ['Lembur', formatIdr(row.overtime_pay)],
    ['Insentif', formatIdr(row.insentif)],
    ['Uang kerajinan', `${yesNo(row.diligence_eligible)} — ${formatIdr(kerajinan)}`],
    ['Bonus omset', formatIdr(row.bonus_omset)],
    [''],
    ['Total tunjangan & penghasilan lain', formatIdr(row.allowances)],
    ['Potongan pinjaman', formatIdr(row.loan_deduction)],
    ['Potongan lainnya', formatIdr(row.other_deductions ?? 0)],
    ['Total potongan', formatIdr(row.deductions)],
    [''],
    ['GAJI DITERIMA', formatIdr(row.final_salary)],
    [''],
    ['Dicetak', new Date().toLocaleString('id-ID')],
  ];
}

function sheetNameFromRow(row, index) {
  const base = String(row.employee_code || row.full_name || `Karyawan${index + 1}`)
    .replace(/[\\/*?:\[\]]/g, '_')
    .slice(0, 28);
  return base || `Slip${index + 1}`;
}

function slipWorkbookFromRows(rows, period) {
  const wb = XLSX.utils.book_new();
  const used = new Set();
  rows.forEach((row, i) => {
    let name = sheetNameFromRow(row, i);
    let n = 1;
    while (used.has(name)) {
      name = `${sheetNameFromRow(row, i).slice(0, 25)}_${++n}`;
    }
    used.add(name);
    const aoa = buildSlipAoa(row, period);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 32 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  return wb;
}

function writeSlipBuffer(wb) {
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  buildSlipAoa,
  slipWorkbookFromRows,
  writeSlipBuffer,
  periodLabel,
};
