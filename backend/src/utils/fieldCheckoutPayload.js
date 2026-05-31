const { AppError } = require('./errors');
const {
  FIELD_OFFICER_CHECKOUT_MAX_LENGTH,
  FIELD_OFFICER_CHECKOUT_SEGMENT_COUNT,
} = require('../constants/fieldOfficer');

const SEGMENT_LABELS = [
  'pabrik',
  'norek',
  'nomor tanda terima',
  'surat jalan',
  'nomor polisi',
  'bs',
  'kode barang',
  'kotor',
  'berat',
];

const INT_MAX_DIGITS = 12;
const NOMOR_POLISI_MAX_LEN = 32;
const KODE_BARANG_MAX_LEN = 64;

function normalizeCode(raw) {
  return raw != null ? String(raw).trim() : '';
}

function parseNonNegativeInt(value, label) {
  if (!/^\d+$/.test(value)) {
    throw new AppError(`Invalid checkout field: ${label} must be a whole number.`, 400, 'INVALID_CHECKOUT_CODE');
  }
  if (value.length > INT_MAX_DIGITS) {
    throw new AppError(`Invalid checkout field: ${label} is too large.`, 400, 'INVALID_CHECKOUT_CODE');
  }
  return Number(value);
}

function parseNonEmptyString(value, label, maxLen) {
  if (!value) {
    throw new AppError(`Invalid checkout field: ${label} is required.`, 400, 'INVALID_CHECKOUT_CODE');
  }
  if (value.length > maxLen) {
    throw new AppError(`Invalid checkout field: ${label} is too long.`, 400, 'INVALID_CHECKOUT_CODE');
  }
  return value;
}

/**
 * Petugas lapangan checkout string:
 * pabrik*norek*nomor tanda terima*surat jalan*nomor polisi*bs*kode barang*kotor*berat
 */
function validateFieldCheckoutCode(raw) {
  const code = normalizeCode(raw);
  if (!code) {
    throw new AppError('Checkout data is required to check out.', 400, 'CHECKOUT_CODE_REQUIRED');
  }
  if (code.length > FIELD_OFFICER_CHECKOUT_MAX_LENGTH) {
    throw new AppError('Checkout data is too long.', 400, 'CHECKOUT_CODE_TOO_LONG');
  }

  const parts = code.split('*').map((p) => p.trim());
  if (parts.length !== FIELD_OFFICER_CHECKOUT_SEGMENT_COUNT) {
    throw new AppError(
      `Checkout data must have ${FIELD_OFFICER_CHECKOUT_SEGMENT_COUNT} fields separated by * ` +
        '(pabrik*norek*nomor tanda terima*surat jalan*nomor polisi*bs*kode barang*kotor*berat).',
      400,
      'INVALID_CHECKOUT_CODE'
    );
  }

  const [
    pabrikRaw,
    norekRaw,
    nomorTandaTerimaRaw,
    suratJalanRaw,
    nomorPolisiRaw,
    bsRaw,
    kodeBarangRaw,
    kotorRaw,
    beratRaw,
  ] = parts;

  return {
    raw: code,
    pabrik: parseNonNegativeInt(pabrikRaw, SEGMENT_LABELS[0]),
    norek: parseNonNegativeInt(norekRaw, SEGMENT_LABELS[1]),
    nomor_tanda_terima: parseNonNegativeInt(nomorTandaTerimaRaw, SEGMENT_LABELS[2]),
    surat_jalan: parseNonNegativeInt(suratJalanRaw, SEGMENT_LABELS[3]),
    nomor_polisi: parseNonEmptyString(nomorPolisiRaw, SEGMENT_LABELS[4], NOMOR_POLISI_MAX_LEN),
    bs: parseNonNegativeInt(bsRaw, SEGMENT_LABELS[5]),
    kode_barang: parseNonEmptyString(kodeBarangRaw, SEGMENT_LABELS[6], KODE_BARANG_MAX_LEN),
    kotor: parseNonNegativeInt(kotorRaw, SEGMENT_LABELS[7]),
    berat: parseNonNegativeInt(beratRaw, SEGMENT_LABELS[8]),
  };
}

module.exports = {
  validateFieldCheckoutCode,
  normalizeCode,
};
