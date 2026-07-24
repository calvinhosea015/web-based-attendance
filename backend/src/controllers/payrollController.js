const { asyncHandler } = require('../middleware/authMiddleware');

function attachmentDisposition(filename) {
  const safe = String(filename).replace(/"/g, "'");
  return `attachment; filename="${safe}"`;
}

function makePayrollController(payrollService) {
  return {
    getSettings: asyncHandler(async (req, res) => {
      res.json(await payrollService.getSettings());
    }),
    updateSettings: asyncHandler(async (req, res) => {
      res.json(await payrollService.updateSettings(req.body));
    }),
    getPeriod: asyncHandler(async (req, res) => {
      res.json(await payrollService.getPeriod(req.params.period));
    }),
    getFinancePeriodSummary: asyncHandler(async (req, res) => {
      const data = await payrollService.getPeriodReadOnly(req.params.period);
      const rows = (data.rows || []).map((row) => ({
        employee_id: row.employee_id,
        employee_code: row.employee_code,
        full_name: row.full_name,
        user_role: row.user_role,
        payroll_mode: row.payroll_mode,
        days_attended: row.days_attended,
        expected_work_days: row.expected_work_days,
        basic_salary: row.basic_salary,
        bonus_omset: row.bonus_omset,
        omset_total: row.omset_total,
        loan_deduction: row.loan_deduction,
        final_salary: row.final_salary,
      }));
      res.json({
        payroll_period: data.payroll_period,
        period_start: data.period_start,
        period_end: data.period_end,
        period_cycle_label: data.period_cycle_label,
        required_work_days: data.required_work_days,
        rows,
        totals: {
          employees: rows.length,
          payroll_sum: rows.reduce((s, r) => s + Number(r.final_salary || 0), 0),
          bonus_omset_sum: rows.reduce((s, r) => s + Number(r.bonus_omset || 0), 0),
          omset_sum: rows.reduce((s, r) => s + Number(r.omset_total || 0), 0),
        },
      });
    }),
    generatePeriod: asyncHandler(async (req, res) => {
      res.json(await payrollService.generatePeriod(req.params.period, req.body || {}));
    }),
    updateEntry: asyncHandler(async (req, res) => {
      res.json(
        await payrollService.updateEntry(req.params.period, req.params.employeeId, req.body)
      );
    }),
    updateEmployeeDefaults: asyncHandler(async (req, res) => {
      res.json(await payrollService.updateEmployeeDefaults(req.params.id, req.body));
    }),
    exportEmployeeSlip: asyncHandler(async (req, res) => {
      const { buffer, filename } = await payrollService.exportEmployeeSlip(
        req.params.period,
        req.params.employeeId
      );
      res.setHeader('Content-Disposition', attachmentDisposition(filename));
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.send(buffer);
    }),
    exportAllSlips: asyncHandler(async (req, res) => {
      const { buffer, filename } = await payrollService.exportAllSlips(req.params.period);
      res.setHeader('Content-Disposition', attachmentDisposition(filename));
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.send(buffer);
    }),
    getFieldOfficerOmsetReport: asyncHandler(async (req, res) => {
      res.json(await payrollService.getFieldOfficerOmsetReport(req.params.period));
    }),
    listAllFieldDeliveries: asyncHandler(async (req, res) => {
      const limit = req.query.limit != null ? Number(req.query.limit) : 5000;
      res.json(await payrollService.listAllFieldDeliveries({ limit }));
    }),
    getFieldDeliveriesFactoryItemSummary: asyncHandler(async (req, res) => {
      res.json(
        await payrollService.getFieldDeliveriesFactoryItemSummary(
          req.query.from,
          req.query.to,
          req.query.pabrik_code
        )
      );
    }),
    exportFieldTonaseBonus: asyncHandler(async (req, res) => {
      const { buffer, filename } = await payrollService.exportFieldTonaseBonusReport(
        req.query.from,
        req.query.to,
        req.query.pabrik_code
      );
      res.setHeader('Content-Disposition', attachmentDisposition(filename));
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.send(buffer);
    }),
  };
}

module.exports = { makePayrollController };
