const { hasMonthlyBasicPayroll } = require('./payrollRoleRules');
const { isHeadOfFinance, usesDailyWagePayroll } = require('../constants/roles');

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Daily wage: payroll row overrides employee profile when > 0; otherwise use employee default
 * so a one-time entry on the profile carries forward until an explicit raise.
 */
function resolveUpahHarian(payrollRow, employee, role, settings = null) {
  if (hasMonthlyBasicPayroll(role) || isHeadOfFinance(role)) return 0;
  const fromEmp = num(employee?.upah_harian ?? payrollRow?.employee_upah_harian);
  const fromPayroll =
    payrollRow?.upah_harian != null && payrollRow?.upah_harian !== ''
      ? num(payrollRow.upah_harian)
      : null;
  const settingsDefault = usesDailyWagePayroll(role) ? num(settings?.default_upah_harian) : 0;
  if (fromPayroll != null && fromPayroll > 0) return fromPayroll;
  if (fromEmp > 0) return fromEmp;
  if (settingsDefault > 0) return settingsDefault;
  return fromPayroll ?? fromEmp ?? 0;
}

module.exports = { resolveUpahHarian };
