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
