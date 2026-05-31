/** Petugas lapangan checkout: 9 segments separated by * */
const FIELD_OFFICER_CHECKOUT_SEGMENT_COUNT = 9;

/** Max length for the full checkout string stored on attendance. */
const FIELD_OFFICER_CHECKOUT_MAX_LENGTH = 512;

/** Example format shown in UI hints. */
const FIELD_OFFICER_CHECKOUT_FORMAT_HINT =
  'pabrik*norek*nomor tanda terima*surat jalan*nomor polisi*bs*kode barang*kotor*berat';

module.exports = {
  FIELD_OFFICER_CHECKOUT_SEGMENT_COUNT,
  FIELD_OFFICER_CHECKOUT_MAX_LENGTH,
  FIELD_OFFICER_CHECKOUT_FORMAT_HINT,
};
