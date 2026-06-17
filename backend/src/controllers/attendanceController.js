const XLSX = require('xlsx');
const { asyncHandler } = require('../middleware/authMiddleware');

const ID_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function absenHjsTitle(dateFrom, dateTo) {
  const from = new Date(`${dateFrom}T12:00:00`);
  const to = new Date(`${dateTo}T12:00:00`);
  const sameMonth =
    from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();
  if (sameMonth && !Number.isNaN(from.getTime())) {
    return `Absen HJS ${ID_MONTHS[from.getMonth()]} ${from.getFullYear()}`;
  }
  return `Absen HJS ${dateFrom} – ${dateTo}`;
}

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
    listForUser: asyncHandler(async (req, res) => {
      const userId = Number(req.params.id);
      const limitRaw = req.query.limit;
      const limit = limitRaw === undefined || limitRaw === '' ? undefined : Number(limitRaw);
      res.json(await attendanceService.listAttendanceForUser(userId, limit));
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
    updateTimes: asyncHandler(async (req, res) => {
      const attendance = await attendanceService.adminUpdateTimes(Number(req.params.id), req.body);
      res.json({ message: 'Attendance times updated.', attendance });
    }),
    exportProfessionalReport: asyncHandler(async (req, res) => {
      const to = req.body.date_to || req.query.date_to || new Date().toISOString().slice(0, 10);
      const from =
        req.body.date_from ||
        req.query.date_from ||
        new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const rows = await attendanceService.absenHjsSummaryRows(from, to);
      const title = absenHjsTitle(from, to);
      const aoa = [
        [title, '', ''],
        ['Nama', 'Hari Kerja', 'Keterangan'],
        ...rows.map((r) => [r.full_name, Number(r.hari_kerja) || 0, '']),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
      ws['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 28 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Absen HJS');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const safeFrom = String(from).replace(/-/g, '');
      res.setHeader('Content-Disposition', `attachment; filename=absen_hjs_${safeFrom}.xlsx`);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.send(buffer);
    }),
  };
}

module.exports = { makeAttendanceController };
