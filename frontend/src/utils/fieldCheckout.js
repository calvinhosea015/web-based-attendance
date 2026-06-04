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
    Number.isFinite(kotorN) && Number.isFinite(bersihN) ? Math.max(0, kotorN - bersihN) : '';
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

/** Split textarea into individual valid-looking lines (one code per line). */
export function splitFieldCheckoutLines(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
