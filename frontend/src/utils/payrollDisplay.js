/** Effective daily wage for display (payroll row, else employee profile). */
export function resolveUpahHarianDisplay(row) {
  const payroll = Number(row?.upah_harian);
  const emp = Number(row?.employee_upah_harian);
  if (Number.isFinite(payroll) && payroll > 0) return payroll;
  if (Number.isFinite(emp) && emp > 0) return emp;
  if (Number.isFinite(payroll)) return payroll;
  if (Number.isFinite(emp)) return emp;
  return 0;
}
