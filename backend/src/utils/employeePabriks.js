function normalizePabrikIdList(pabrikIds) {
  const raw = Array.isArray(pabrikIds) ? pabrikIds : [];
  return [...new Set(raw.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n >= 1))];
}

module.exports = { normalizePabrikIdList };
