function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Potongan lain only. Never use total `deductions` or subtract late/absen/kasbon. */
function resolveOtherDeductionsAmount(source) {
  if (source == null) return 0;
  if (source.other_deductions != null) return Math.max(0, num(source.other_deductions));
  return 0;
}

/** Client update payload: `other_deductions`, or legacy alias `deductions` meaning potongan lain. */
function resolveOtherDeductionsFromPayload(payload, existing) {
  if (payload?.other_deductions != null) return Math.max(0, num(payload.other_deductions));
  if (payload?.deductions != null) return Math.max(0, num(payload.deductions));
  return resolveOtherDeductionsAmount(existing);
}

module.exports = {
  resolveOtherDeductionsAmount,
  resolveOtherDeductionsFromPayload,
};
