/** Effective daily wage for display (payroll row, employee profile, then field-officer default). */
export function resolveUpahHarianDisplay(row, settings = null) {
  const payroll = Number(row?.upah_harian);
  const emp = Number(row?.employee_upah_harian);
  const isFieldOfficer = row?.user_role === 'field_officer';
  const settingsDefault = isFieldOfficer ? Number(settings?.default_upah_harian) : 0;
  if (Number.isFinite(payroll) && payroll > 0) return payroll;
  if (Number.isFinite(emp) && emp > 0) return emp;
  if (Number.isFinite(settingsDefault) && settingsDefault > 0) return settingsDefault;
  if (Number.isFinite(payroll)) return payroll;
  if (Number.isFinite(emp)) return emp;
  return 0;
}
