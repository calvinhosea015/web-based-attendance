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
    exportFieldTonaseBonus: asyncHandler(async (req, res) => {
      const { buffer, filename } = await payrollService.exportFieldTonaseBonusReport(
        req.query.from,
        req.query.to
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
