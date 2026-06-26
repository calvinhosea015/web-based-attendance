const FIELD_OFFICER_BONUS_RATE = 0.02;

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

/** Omset per baris = harga per item × berat bersih; tonase per item is the fallback rate when no price is set. */
function computeLineOmset(tonasePerItem, beratBersih, pricePerItem = 0) {
  const price = num(pricePerItem);
  const rate = price > 0 ? price : num(tonasePerItem);
  return Math.round(rate * num(beratBersih) * 100) / 100;
}

/** Bonus per baris = omset × 2%. */
function computeLineBonus(tonasePerItem, beratBersih, pricePerItem = 0) {
  const amount =
    computeLineOmset(tonasePerItem, beratBersih, pricePerItem) * FIELD_OFFICER_BONUS_RATE;
  return Math.round(amount * 100) / 100;
}

module.exports = {
  FIELD_OFFICER_BONUS_RATE,
  computeSelisih,
  computeLineOmset,
  computeLineBonus,
};
