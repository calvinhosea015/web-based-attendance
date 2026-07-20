const FIELD_OFFICER_BONUS_RATE = 0.02;

/** PT Mega Surya Eratama (pabrik catalog code "3") — 1%; all other pabrik stay at 2%. */
const PABRIK_BONUS_RATE_OVERRIDES = {
  3: 0.01,
};

function resolveFieldOfficerBonusRate(pabrikCode) {
  const code = String(pabrikCode ?? '').trim();
  if (!code) return FIELD_OFFICER_BONUS_RATE;
  const override = PABRIK_BONUS_RATE_OVERRIDES[code];
  return override != null ? override : FIELD_OFFICER_BONUS_RATE;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Selisih = berat kotor − berat bersih (kg). */
function computeSelisih(kotor, beratBersih) {
  const gross = num(kotor);
  const net = num(beratBersih);
  if (net > gross) {
    return { ok: false, message: 'Berat bersih cannot exceed berat kotor.' };
  }
  return { ok: true, selisih: gross - net };
}

/** Omset per baris = harga per item × berat bersih. */
function computeLineOmset(_tonasePerItem, beratBersih, pricePerItem = 0) {
  const price = num(pricePerItem);
  return Math.round(price * num(beratBersih) * 100) / 100;
}

/** Bonus per baris = omset × pabrik rate (default 2%). */
function computeLineBonus(tonasePerItem, beratBersih, pricePerItem = 0, pabrikCode) {
  const bonusRate = resolveFieldOfficerBonusRate(pabrikCode);
  const amount = computeLineOmset(tonasePerItem, beratBersih, pricePerItem) * bonusRate;
  return Math.round(amount * 100) / 100;
}

module.exports = {
  FIELD_OFFICER_BONUS_RATE,
  PABRIK_BONUS_RATE_OVERRIDES,
  resolveFieldOfficerBonusRate,
  computeSelisih,
  computeLineOmset,
  computeLineBonus,
};
