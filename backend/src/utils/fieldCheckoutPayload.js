const { AppError } = require('./errors');
const {
  FIELD_OFFICER_CHECKOUT_MAX_LENGTH,
  FIELD_OFFICER_CHECKOUT_SEGMENT_COUNT,
} = require('../constants/fieldOfficer');

const SEGMENT_LABELS = [
  'kode pabrik',
  'norek (5 digit)',
  'nomor tanda terima',
  'nomor surat jalan',
  'nopol',
  'no bs',
  'kode barang',
  'kotor',
  'berat bersih',
];

const FORMAT_HINT =
  'kode pabrik*norek*nomor tanda terima*nomor surat jalan*nopol*no bs*kode barang*kotor*berat bersih';

const INT_MAX_DIGITS = 12;
const PABRIK_CODE_MAX_LEN = 32;
const NOPOL_MAX_LEN = 32;
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

function parseNonNegativeNumber(value, label) {
  const normalized = String(value).replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new AppError(`Invalid checkout field: ${label} must be a number.`, 400, 'INVALID_CHECKOUT_CODE');
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) {
    throw new AppError(`Invalid checkout field: ${label} must be zero or positive.`, 400, 'INVALID_CHECKOUT_CODE');
  }
  return n;
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

function parsePabrikCode(value) {
  const code = parseNonEmptyString(value, SEGMENT_LABELS[0], PABRIK_CODE_MAX_LEN);
  if (!/^[A-Za-z0-9_-]+$/.test(code)) {
    throw new AppError(
      'Invalid checkout field: kode pabrik may only contain letters, numbers, hyphen, and underscore.',
      400,
      'INVALID_CHECKOUT_CODE'
    );
  }
  return code;
}

function parseNorek(value) {
  const norek = String(value).trim();
  if (!/^\d{5}$/.test(norek)) {
    throw new AppError('Invalid checkout field: norek must be exactly 5 digits.', 400, 'INVALID_CHECKOUT_CODE');
  }
  return norek;
}

/**
 * Petugas lapangan delivery string (9 segments, *):
 * kode pabrik*norek*nomor tanda terima*nomor surat jalan*nopol*no bs*kode barang*kotor*berat bersih
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
      `Checkout data must have ${FIELD_OFFICER_CHECKOUT_SEGMENT_COUNT} fields separated by * (${FORMAT_HINT}).`,
      400,
      'INVALID_CHECKOUT_CODE'
    );
  }

  const [
    pabrikRaw,
    norekRaw,
    nomorTandaTerimaRaw,
    suratJalanRaw,
    nopolRaw,
    bsRaw,
    kodeBarangRaw,
    kotorRaw,
    beratBersihRaw,
  ] = parts;

  const kotor = parseNonNegativeNumber(kotorRaw, SEGMENT_LABELS[7]);
  const berat_bersih = parseNonNegativeNumber(beratBersihRaw, SEGMENT_LABELS[8]);
  if (berat_bersih > kotor) {
    throw new AppError('Invalid checkout field: berat bersih cannot exceed kotor.', 400, 'INVALID_CHECKOUT_CODE');
  }

  return {
    raw: code,
    pabrik_code: parsePabrikCode(pabrikRaw),
    pabrik: parsePabrikCode(pabrikRaw),
    norek: parseNorek(norekRaw),
    nomor_tanda_terima: parseNonNegativeInt(nomorTandaTerimaRaw, SEGMENT_LABELS[2]),
    nomor_surat_jalan: parseNonNegativeInt(suratJalanRaw, SEGMENT_LABELS[3]),
    surat_jalan: parseNonNegativeInt(suratJalanRaw, SEGMENT_LABELS[3]),
    nopol: parseNonEmptyString(nopolRaw, SEGMENT_LABELS[4], NOPOL_MAX_LEN),
    nomor_polisi: parseNonEmptyString(nopolRaw, SEGMENT_LABELS[4], NOPOL_MAX_LEN),
    no_bs: parseNonNegativeInt(bsRaw, SEGMENT_LABELS[5]),
    bs: parseNonNegativeInt(bsRaw, SEGMENT_LABELS[5]),
    kode_barang: parseNonEmptyString(kodeBarangRaw, SEGMENT_LABELS[6], KODE_BARANG_MAX_LEN)
      .replace(/\s+/g, ' ')
      .toUpperCase(),
    kotor,
    berat_bersih,
    berat: berat_bersih,
    selisih: kotor - berat_bersih,
  };
}

/** Split textarea / payload into individual code lines. */
function normalizeFieldCheckoutCodes(payload) {
  const list = [];
  if (Array.isArray(payload?.codes)) {
    for (const item of payload.codes) {
      const c = normalizeCode(item);
      if (c) list.push(c);
    }
  }
  const single = normalizeCode(payload?.code);
  if (single) {
    if (single.includes('\n')) {
      for (const line of single.split(/\r?\n/)) {
        const c = normalizeCode(line);
        if (c) list.push(c);
      }
    } else {
      list.push(single);
    }
  }
  return list;
}

module.exports = {
  validateFieldCheckoutCode,
  normalizeCode,
  normalizeFieldCheckoutCodes,
  FORMAT_HINT,
  SEGMENT_LABELS,
};
