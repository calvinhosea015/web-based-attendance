const { cycleEndDate } = require('./payrollPeriod');

/** Rp per full year of service (default 100,000). */
const TUNJANGAN_MASA_KERJA_PER_YEAR = Number(process.env.TUNJANGAN_MASA_KERJA_PER_YEAR) || 100_000;

/** Cap: 15 years and over is a fixed Rp 1,500,000 (default = 15 × per-year). */
const TUNJANGAN_MASA_KERJA_MAX =
  Number(process.env.TUNJANGAN_MASA_KERJA_MAX) || 1_500_000;

function parseDateOnly(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Completed full years of service (anniversary not yet reached this year → minus one). */
function fullYearsOfService(joinDate, asOfDate) {
  const start = parseDateOnly(joinDate);
  const end = parseDateOnly(asOfDate);
  if (!start || !end || end < start) return 0;

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) months -= 1;
  if (months < 0) {
    years -= 1;
  }
  return Math.max(0, years);
}

/**
 * Tunjangan masa kerja = Rp 100,000 × completed years of service (as of period end),
 * capped at Rp 1,500,000 — i.e. 15 years and over is a fixed rate.
 * @param {string|Date} joinDate
 * @param {string|Date} asOfDate
 * @param {number} [perYear]
 */
function computeTunjanganMasaKerja(joinDate, asOfDate, perYear = TUNJANGAN_MASA_KERJA_PER_YEAR) {
  const years = fullYearsOfService(joinDate, asOfDate);
  return Math.min(Math.round(years * Number(perYear)), TUNJANGAN_MASA_KERJA_MAX);
}

function tunjanganAsOfForPayrollPeriod(payrollPeriod) {
  return cycleEndDate(payrollPeriod) || new Date();
}

/** Accounting and Petugas Lapangan only (Staff Kantor excluded). */
function receivesTunjanganMasaKerja(role) {
  const { usesDailyWagePayroll, isAccounting } = require('../constants/roles');
  return isAccounting(role) || usesDailyWagePayroll(role);
}

function resolveTunjanganMasaKerjaForRole(role, joinDate, payrollPeriod) {
  if (!receivesTunjanganMasaKerja(role)) return 0;
  return computeTunjanganMasaKerja(joinDate, tunjanganAsOfForPayrollPeriod(payrollPeriod));
}

module.exports = {
  TUNJANGAN_MASA_KERJA_PER_YEAR,
  TUNJANGAN_MASA_KERJA_MAX,
  fullYearsOfService,
  computeTunjanganMasaKerja,
  tunjanganAsOfForPayrollPeriod,
  receivesTunjanganMasaKerja,
  resolveTunjanganMasaKerjaForRole,
};
