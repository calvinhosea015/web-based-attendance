/** Must match backend FIELD_OFFICER_CHECKOUT_SEGMENT_COUNT */
export const FIELD_CHECKOUT_SEGMENT_COUNT = 9;

export const FIELD_CHECKOUT_FORMAT_HINT =
  'kode pabrik*norek*nomor tanda terima*nomor surat jalan*nopol*no bs*kode barang*kotor*berat bersih';

export function isFieldCheckoutFormatValid(code) {
  const trimmed = String(code ?? '').trim();
  if (!trimmed) return false;
  const parts = trimmed.split('*').map((p) => p.trim());
  if (parts.length !== FIELD_CHECKOUT_SEGMENT_COUNT) return false;
  if (!parts.every((p) => p.length > 0)) return false;
  if (!/^\d{5}$/.test(parts[1])) return false;
  return true;
}

/** @returns {Record<string, string>|null} */
export function parseFieldCheckoutDisplay(code) {
  if (!isFieldCheckoutFormatValid(code)) return null;
  const [
    pabrik,
    norek,
    nomorTandaTerima,
    suratJalan,
    nopol,
    bs,
    kodeBarang,
    kotor,
    beratBersih,
  ] = String(code)
    .trim()
    .split('*')
    .map((p) => p.trim());
  const kotorN = Number(kotor);
  const bersihN = Number(beratBersih);
  const selisih =
    Number.isFinite(kotorN) && Number.isFinite(bersihN) ? Math.abs(kotorN - bersihN) : '';
  return {
    pabrik,
    norek,
    nomor_tanda_terima: nomorTandaTerima,
    surat_jalan: suratJalan,
    nomor_surat_jalan: suratJalan,
    nopol,
    nomor_polisi: nopol,
    bs,
    no_bs: bs,
    kode_barang: kodeBarang,
    kotor,
    berat_bersih: beratBersih,
    berat: beratBersih,
    selisih: selisih === '' ? '' : String(selisih),
  };
}

/** Structured API row or raw checkout code string. */
export function fieldDeliveryDisplayFields(row) {
  if (row?.pabrik_code) {
    const pabrikLabel = row.nama_pabrik
      ? `${row.pabrik_code} (${row.nama_pabrik})`
      : row.pabrik_code;
    return {
      pabrik: pabrikLabel,
      norek: row.norek,
      nomor_tanda_terima: row.nomor_tanda_terima,
      nomor_surat_jalan: row.nomor_surat_jalan,
      nopol: row.nopol,
      no_bs: row.no_bs,
      kode_barang: row.kode_barang,
      kotor: row.kotor,
      berat_bersih: row.berat_bersih,
      selisih: row.selisih,
    };
  }
  return parseFieldCheckoutDisplay(row?.checkout_code);
}

/** Split textarea into individual valid-looking lines (one code per line). */
export function splitFieldCheckoutLines(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Unique sorted option values from delivery rows (empty values skipped). */
export function uniqueDeliveryFilterValues(rows, key) {
  const seen = new Set();
  for (const row of rows || []) {
    const v = String(row?.[key] ?? '').trim();
    if (v) seen.add(v);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'id'));
}

/**
 * Client-side recap filters. Empty string = all for that dimension.
 * @param {object[]} rows
 * @param {{ pabrik?: string, officer?: string, kodeBarang?: string }} filters
 *   officer matches `employee_code` (preferred) or `full_name`.
 */
export function filterDeliveryRecap(rows, { pabrik = '', officer = '', kodeBarang = '' } = {}) {
  const p = String(pabrik || '').trim();
  const o = String(officer || '').trim();
  const k = String(kodeBarang || '').trim();
  if (!p && !o && !k) return rows || [];
  return (rows || []).filter((row) => {
    if (p && String(row.pabrik_code ?? '').trim() !== p) return false;
    if (o) {
      const code = String(row.employee_code ?? '').trim();
      const name = String(row.full_name ?? '').trim();
      if (code !== o && name !== o) return false;
    }
    if (k && String(row.kode_barang ?? '').trim() !== k) return false;
    return true;
  });
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Roll up delivery lines by factory → item (net weight + bonus).
 * @param {object[]} entries
 * @returns {{ pabrik_code: string, nama_pabrik: string, total_berat_bersih: number, total_bonus: number, total_omset: number, delivery_count: number, items: object[] }[]}
 */
export function groupFieldDeliveriesByFactoryItem(entries) {
  /** @type {Map<string, { pabrik_code: string, nama_pabrik: string, items: Map<string, object> }>} */
  const factories = new Map();
  for (const row of entries || []) {
    const pabrik_code = String(row.pabrik_code ?? '').trim() || '?';
    const kode_barang = String(row.kode_barang ?? '').trim() || '?';
    let factory = factories.get(pabrik_code);
    if (!factory) {
      factory = {
        pabrik_code,
        nama_pabrik: String(row.nama_pabrik ?? '').trim(),
        items: new Map(),
      };
      factories.set(pabrik_code, factory);
    } else if (!factory.nama_pabrik && row.nama_pabrik) {
      factory.nama_pabrik = String(row.nama_pabrik).trim();
    }
    let item = factory.items.get(kode_barang);
    if (!item) {
      item = {
        kode_barang,
        nama_barang: String(row.nama_barang ?? '').trim(),
        delivery_count: 0,
        total_berat_bersih: 0,
        total_bonus: 0,
        total_omset: 0,
      };
      factory.items.set(kode_barang, item);
    } else if (!item.nama_barang && row.nama_barang) {
      item.nama_barang = String(row.nama_barang).trim();
    }
    item.delivery_count += 1;
    item.total_berat_bersih += num(row.berat_bersih);
    item.total_bonus += num(row.bonus_amount);
    item.total_omset += num(row.omset_amount);
  }

  return [...factories.values()]
    .map((f) => {
      const items = [...f.items.values()]
        .map((it) => ({
          ...it,
          total_berat_bersih: Math.round(it.total_berat_bersih * 100) / 100,
          total_bonus: Math.round(it.total_bonus * 100) / 100,
          total_omset: Math.round(it.total_omset * 100) / 100,
        }))
        .sort((a, b) => a.kode_barang.localeCompare(b.kode_barang, 'id'));
      return {
        pabrik_code: f.pabrik_code,
        nama_pabrik: f.nama_pabrik,
        items,
        delivery_count: items.reduce((s, it) => s + it.delivery_count, 0),
        total_berat_bersih:
          Math.round(items.reduce((s, it) => s + it.total_berat_bersih, 0) * 100) / 100,
        total_bonus: Math.round(items.reduce((s, it) => s + it.total_bonus, 0) * 100) / 100,
        total_omset: Math.round(items.reduce((s, it) => s + it.total_omset, 0) * 100) / 100,
      };
    })
    .sort((a, b) => a.pabrik_code.localeCompare(b.pabrik_code, 'id'));
}
