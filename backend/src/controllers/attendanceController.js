const XLSX = require('xlsx');
const { asyncHandler } = require('../middleware/authMiddleware');

function makeAttendanceController(attendanceService) {
  return {
    checkIn: asyncHandler(async (req, res) => {
      const data = await attendanceService.checkIn(req.auth, req.body, req.clientMeta);
      res.json(data);
    }),
    checkOut: asyncHandler(async (req, res) => {
      const data = await attendanceService.checkOut(req.auth, req.body, req.clientMeta);
      res.json(data);
    }),
    listAll: asyncHandler(async (req, res) => {
      res.json(await attendanceService.listAll());
    }),
    listMine: asyncHandler(async (req, res) => {
      res.json(await attendanceService.listMine(req.auth));
    }),
    exportExcel: asyncHandler(async (req, res) => {
      const rows = await attendanceService.exportRows();
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', 'attachment; filename=attendance.xlsx');
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.send(buffer);
    }),
    exportProfessionalReport: asyncHandler(async (req, res) => {
      const to = req.body.date_to || req.query.date_to || new Date().toISOString().slice(0, 10);
      const from =
        req.body.date_from ||
        req.query.date_from ||
        new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const rows = await attendanceService.professionalReportRows(from, to);
      const mapped = rows.map((r) => ({
        'Employee ID': r.employee_id,
        Username: r.username || '',
        'Full Name': r.full_name,
        Department: r.department,
        Date: r.day,
        'Check In': r.check_in ? new Date(r.check_in).toISOString() : '',
        'Check Out': r.check_out ? new Date(r.check_out).toISOString() : '',
        'Total Hours': r.total_hours != null ? Number(r.total_hours) : '',
        Overtime: r.overtime != null ? Number(r.overtime) : '',
        'Late Minutes': r.late_minutes,
        'Attendance Status': r.attendance_status,
        Location: r.location,
        'Device Used': r.device_used || '',
      }));
      const ws = XLSX.utils.json_to_sheet(mapped.length ? mapped : [{}]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Professional Report');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', 'attachment; filename=attendance_professional_report.xlsx');
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.send(buffer);
    }),
  };
}

module.exports = { makeAttendanceController };
