const { AppError } = require('../utils/errors');

class AttendanceCorrectionService {
  constructor(attendanceCorrectionRepository, attendanceRepository, attendanceService) {
    this.attendanceCorrectionRepository = attendanceCorrectionRepository;
    this.attendanceRepository = attendanceRepository;
    this.attendanceService = attendanceService;
  }

  async submit(auth, body) {
    if (!auth.employeeId) {
      throw new AppError('Account is not linked to an employee profile.', 400, 'NO_EMPLOYEE');
    }

    const attendanceId = Number(body.attendance_id);
    const row = await this.attendanceRepository.findById(attendanceId);
    if (!row) {
      throw new AppError('Attendance record not found.', 404, 'ATTENDANCE_NOT_FOUND');
    }
    if (row.employee_id !== auth.employeeId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const hasPending = await this.attendanceCorrectionRepository.hasPendingForAttendance(attendanceId);
    if (hasPending) {
      throw new AppError(
        'A pending correction already exists for this attendance record.',
        400,
        'CORRECTION_PENDING'
      );
    }

    const requestedChanges = {};
    if (Object.prototype.hasOwnProperty.call(body, 'check_in')) {
      requestedChanges.check_in = body.check_in;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'check_out')) {
      requestedChanges.check_out = body.check_out;
    }
    if (!Object.keys(requestedChanges).length) {
      throw new AppError('Provide check_in and/or check_out to correct.', 400, 'NO_FIELDS');
    }

    return this.attendanceCorrectionRepository.create({
      employeeId: auth.employeeId,
      attendanceId,
      reason: String(body.reason || '').trim(),
      requestedChanges,
    });
  }

  async listMine(auth) {
    if (!auth.employeeId) {
      throw new AppError('Account is not linked to an employee profile.', 400, 'NO_EMPLOYEE');
    }
    return this.attendanceCorrectionRepository.listByEmployee(auth.employeeId);
  }

  async listPending() {
    return this.attendanceCorrectionRepository.listPending();
  }

  async decide(id, auth, { status }) {
    if (!['approved', 'rejected'].includes(status)) {
      throw new AppError('Invalid status.', 400, 'STATUS');
    }

    const existing = await this.attendanceCorrectionRepository.findById(id);
    if (!existing || existing.approval_status !== 'pending') {
      throw new AppError('Request not found.', 404, 'NOT_FOUND');
    }

    const row = await this.attendanceCorrectionRepository.setDecision(id, {
      status,
      decidedBy: auth.userId,
    });
    if (!row) {
      throw new AppError('Request not found.', 404, 'NOT_FOUND');
    }

    if (status === 'approved') {
      let changes = row.requested_changes;
      if (typeof changes === 'string') {
        try {
          changes = JSON.parse(changes);
        } catch {
          changes = {};
        }
      }
      const patch = {};
      if (changes?.check_in != null) patch.check_in = changes.check_in;
      if (Object.prototype.hasOwnProperty.call(changes || {}, 'check_out')) {
        patch.check_out = changes.check_out;
      }
      if (Object.keys(patch).length) {
        await this.attendanceService.adminUpdateTimes(row.attendance_id, patch);
      }
    }

    return row;
  }
}

module.exports = { AttendanceCorrectionService };
