const { AppError } = require('../utils/errors');

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function enrichLoanProgress(row, deductions = []) {
  const loanAmount = num(row.loan_amount);
  const monthly = num(row.monthly_deduction);
  const monthsTotal = monthly > 0 ? Math.ceil(loanAmount / monthly) : 0;

  if (row.approval_status !== 'approved') {
    return {
      ...row,
      amount_paid: 0,
      remaining_balance: null,
      progress_percent: null,
      months_total: monthsTotal,
      months_paid: 0,
      is_paid_off: false,
      deductions: [],
    };
  }

  const remaining = num(row.remaining_balance ?? row.loan_amount);
  const amountPaid = Math.max(0, loanAmount - remaining);
  const progressPercent =
    loanAmount > 0 ? Math.min(100, Math.round((amountPaid / loanAmount) * 1000) / 10) : 0;
  const monthsPaid = deductions.length > 0 ? deductions.length : monthly > 0 ? Math.floor(amountPaid / monthly) : 0;

  return {
    ...row,
    amount_paid: amountPaid,
    remaining_balance: remaining,
    progress_percent: progressPercent,
    months_total: monthsTotal,
    months_paid: monthsPaid,
    is_paid_off: remaining <= 0,
    deductions,
  };
}

class LoanService {
  constructor(loanRequestRepository, notificationRepository, employeeRepository) {
    this.loanRequestRepository = loanRequestRepository;
    this.notificationRepository = notificationRepository;
    this.employeeRepository = employeeRepository;
  }

  async notifyAdminNewLoan(employee, row) {
    if (!this.notificationRepository || !employee || !row) return;
    const amount = num(row.loan_amount).toLocaleString('id-ID');
    await this.notificationRepository.insertAdminAlert({
      type: 'loan_request',
      title: 'New loan request',
      body: `${employee.full_name} (${employee.employee_id}) submitted a loan for Rp ${amount}.`,
      payload: { requestId: row.id, employeeId: row.employee_id },
    });
  }

  async submit(auth, payload) {
    if (!auth.employeeId) {
      throw new AppError('Account is not linked to an employee profile.', 400, 'NO_EMPLOYEE');
    }
    const loanAmount = num(payload.loan_amount);
    const monthlyDeduction = num(payload.monthly_deduction);
    if (loanAmount <= 0) {
      throw new AppError('Loan amount must be greater than zero.', 400, 'LOAN_AMOUNT');
    }
    if (monthlyDeduction <= 0) {
      throw new AppError('Monthly deduction must be greater than zero.', 400, 'LOAN_DEDUCTION');
    }
    if (monthlyDeduction > loanAmount) {
      throw new AppError('Monthly deduction cannot exceed loan amount.', 400, 'LOAN_DEDUCTION');
    }

    const pending = await this.loanRequestRepository.countPendingForEmployee(auth.employeeId);
    if (pending > 0) {
      throw new AppError('You already have a pending loan request.', 400, 'LOAN_PENDING');
    }

    const row = await this.loanRequestRepository.create({
      employeeId: auth.employeeId,
      loanAmount,
      monthlyDeduction,
      notes: payload.notes ? String(payload.notes).trim().slice(0, 2000) : null,
    });
    const employee = this.employeeRepository
      ? await this.employeeRepository.findById(auth.employeeId)
      : null;
    await this.notifyAdminNewLoan(employee, row).catch(() => {});
    return row;
  }

  async listMine(auth) {
    if (!auth.employeeId) return [];
    const rows = await this.loanRequestRepository.listForEmployee(auth.employeeId);
    const enriched = await Promise.all(
      rows.map(async (row) => {
        const deductions =
          row.approval_status === 'approved'
            ? await this.loanRequestRepository.listDeductionsForLoan(row.id)
            : [];
        return enrichLoanProgress(row, deductions);
      })
    );
    return enriched;
  }

  async listPending() {
    return this.loanRequestRepository.listPending();
  }

  async listAll(query = {}) {
    const status = query.status;
    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      throw new AppError('Invalid status.', 400, 'STATUS');
    }
    return this.loanRequestRepository.listAll({ status: status || null });
  }

  async decide(id, auth, { status, rejection_reason }) {
    if (!['approved', 'rejected'].includes(status)) {
      throw new AppError('Invalid status.', 400, 'STATUS');
    }
    if (status === 'approved') {
      const pending = await this.loanRequestRepository.findById(Number(id));
      if (!pending) throw new AppError('Request not found or already decided.', 404, 'NOT_FOUND');
      const active = await this.loanRequestRepository.countActiveForEmployee(pending.employee_id);
      if (active > 0) {
        throw new AppError(
          'Employee already has an active loan being repaid.',
          400,
          'LOAN_ACTIVE'
        );
      }
    }
    const row = await this.loanRequestRepository.setDecision(Number(id), {
      status,
      decidedBy: auth.userId,
      rejectionReason: status === 'rejected' ? rejection_reason : null,
    });
    if (!row) throw new AppError('Request not found or already decided.', 404, 'NOT_FOUND');
    return row;
  }
}

module.exports = { LoanService };
