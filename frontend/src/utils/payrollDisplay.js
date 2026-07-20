export function formatIdr(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

import { usesDailyWagePayrollRole } from '../roles.js';

/** Effective daily wage for display (payroll row, employee profile, then daily-wage default). */
export function resolveUpahHarianDisplay(row, settings = null) {
  const payroll = Number(row?.upah_harian);
  const emp = Number(row?.employee_upah_harian);
  const settingsDefault = usesDailyWagePayrollRole(row?.user_role)
    ? Number(settings?.default_upah_harian)
    : 0;
  if (Number.isFinite(payroll) && payroll > 0) return payroll;
  if (Number.isFinite(emp) && emp > 0) return emp;
  if (Number.isFinite(settingsDefault) && settingsDefault > 0) return settingsDefault;
  if (Number.isFinite(payroll)) return payroll;
  if (Number.isFinite(emp)) return emp;
  return 0;
}
