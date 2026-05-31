/** Must match backend FIELD_OFFICER_CHECKOUT_SEGMENT_COUNT */
export const FIELD_CHECKOUT_SEGMENT_COUNT = 9;

export const FIELD_CHECKOUT_FORMAT_HINT =
  'pabrik*norek*nomor tanda terima*surat jalan*nomor polisi*bs*kode barang*kotor*berat';

export function isFieldCheckoutFormatValid(code) {
  const trimmed = String(code ?? '').trim();
  if (!trimmed) return false;
  const parts = trimmed.split('*').map((p) => p.trim());
  return parts.length === FIELD_CHECKOUT_SEGMENT_COUNT && parts.every((p) => p.length > 0);
}

/** @returns {Record<string, string>|null} */
export function parseFieldCheckoutDisplay(code) {
  if (!isFieldCheckoutFormatValid(code)) return null;
  const [
    pabrik,
    norek,
    nomorTandaTerima,
    suratJalan,
    nomorPolisi,
    bs,
    kodeBarang,
    kotor,
    berat,
  ] = String(code)
    .trim()
    .split('*')
    .map((p) => p.trim());
  return {
    pabrik,
    norek,
    nomor_tanda_terima: nomorTandaTerima,
    surat_jalan: suratJalan,
    nomor_polisi: nomorPolisi,
    bs,
    kode_barang: kodeBarang,
    kotor,
    berat,
  };
}
