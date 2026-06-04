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

/** Omset per baris = tonase per item × selisih (basis sebelum 2%). */
function computeLineOmset(tonasePerItem, selisih) {
  return Math.round(num(tonasePerItem) * num(selisih) * 100) / 100;
}

/** Bonus per baris = omset × 2%. */
function computeLineBonus(tonasePerItem, selisih) {
  const amount = computeLineOmset(tonasePerItem, selisih) * FIELD_OFFICER_BONUS_RATE;
  return Math.round(amount * 100) / 100;
}

module.exports = {
  FIELD_OFFICER_BONUS_RATE,
  computeSelisih,
  computeLineOmset,
  computeLineBonus,
};
