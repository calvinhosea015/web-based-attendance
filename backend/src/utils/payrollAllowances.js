function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Effective transport flag: payroll row overrides employee profile. */
function resolveTransportEligible(row, employee) {
  if (row?.transport_eligible != null) return Boolean(row.transport_eligible);
  return Boolean(employee?.transport_eligible ?? row?.employee_transport_eligible);
}

function resolveDiligenceEligible(row) {
  return Boolean(row?.diligence_eligible);
}

/**
 * Paid allowance amounts for payroll totals / slip (when eligible, fall back to employee or global defaults).
 */
function resolvePayrollAllowanceAmounts({
  transportEligible,
  diligenceEligible,
  transportAllowanceStored,
  diligenceBonusStored,
  employeeTransportAmount,
  employeeDiligenceAmount,
  settingsTransportAmount = 250_000,
  settingsDiligenceAmount = 100_000,
}) {
  const defaultTransport = num(employeeTransportAmount ?? settingsTransportAmount);
  const defaultDiligence = num(employeeDiligenceAmount ?? settingsDiligenceAmount);
  const storedTransport = num(transportAllowanceStored);
  const storedDiligence = num(diligenceBonusStored);

  const transport_allowance = transportEligible
    ? storedTransport > 0
      ? storedTransport
      : defaultTransport
    : 0;
  const diligence_bonus = diligenceEligible
    ? storedDiligence > 0
      ? storedDiligence
      : defaultDiligence
    : 0;

  return { transport_allowance, diligence_bonus };
}

/** Rate fields passed into computeTotals (transport_allowance_amount / diligence_allowance_amount). */
function resolveAllowanceRateFields({
  transportEligible,
  diligenceEligible,
  transportAllowanceStored,
  diligenceBonusStored,
  employeeTransportAmount,
  employeeDiligenceAmount,
  settings,
}) {
  const settingsTransportAmount = num(settings?.transport_amount ?? 250_000);
  const settingsDiligenceAmount = num(settings?.diligence_amount ?? 100_000);
  const { transport_allowance, diligence_bonus } = resolvePayrollAllowanceAmounts({
    transportEligible,
    diligenceEligible,
    transportAllowanceStored,
    diligenceBonusStored,
    employeeTransportAmount,
    employeeDiligenceAmount,
    settingsTransportAmount,
    settingsDiligenceAmount,
  });
  return {
    transport_allowance_amount: transportEligible
      ? transport_allowance
      : num(employeeTransportAmount ?? settingsTransportAmount),
    diligence_allowance_amount: diligenceEligible
      ? diligence_bonus
      : num(employeeDiligenceAmount ?? settingsDiligenceAmount),
  };
}

module.exports = {
  resolveTransportEligible,
  resolveDiligenceEligible,
  resolvePayrollAllowanceAmounts,
  resolveAllowanceRateFields,
};
