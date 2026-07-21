const FIELD_OFFICER_BONUS_RATE = 0.02;

/** Use stored pabrik rate when valid; otherwise the global default (2%). */
function resolveFieldOfficerBonusRate(bonusRate) {
  const n = Number(bonusRate);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  return FIELD_OFFICER_BONUS_RATE;
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

/** Bonus per baris = omset × pabrik bonus_omset_rate (default 2%). */
function computeLineBonus(tonasePerItem, beratBersih, pricePerItem = 0, bonusRate) {
  const rate = resolveFieldOfficerBonusRate(bonusRate);
  const amount = computeLineOmset(tonasePerItem, beratBersih, pricePerItem) * rate;
  return Math.round(amount * 100) / 100;
}

module.exports = {
  FIELD_OFFICER_BONUS_RATE,
  resolveFieldOfficerBonusRate,
  computeSelisih,
  computeLineOmset,
  computeLineBonus,
};
