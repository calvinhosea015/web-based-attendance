const LEAVE_TYPES = {
  MEDICAL: 'medical',
  UNPAID: 'unpaid',
  PATERNITY: 'paternity',
};

const VALID_LEAVE_TYPES = Object.values(LEAVE_TYPES);

const LEAVE_TYPE_SETTINGS_KEYS = {
  [LEAVE_TYPES.MEDICAL]: 'medical_days_per_year',
  [LEAVE_TYPES.UNPAID]: 'unpaid_days_per_year',
  [LEAVE_TYPES.PATERNITY]: 'paternity_days_per_year',
};

/** Medical leave requires a supporting document (photo). */
function requiresAttachment(leaveType) {
  return leaveType === LEAVE_TYPES.MEDICAL;
}

/** Fixed pay treatment when leave is approved. Paternity is chosen by admin on approval. */
function resolveIsPaidOnApproval(leaveType, adminChoice) {
  if (leaveType === LEAVE_TYPES.MEDICAL) return true;
  if (leaveType === LEAVE_TYPES.UNPAID) return false;
  if (leaveType === LEAVE_TYPES.PATERNITY) {
    if (adminChoice === true || adminChoice === 'true' || adminChoice === 1 || adminChoice === '1') {
      return true;
    }
    if (adminChoice === false || adminChoice === 'false' || adminChoice === 0 || adminChoice === '0') {
      return false;
    }
    return null;
  }
  return null;
}

function requiresPaidChoiceOnApproval(leaveType) {
  return leaveType === LEAVE_TYPES.PATERNITY;
}

module.exports = {
  LEAVE_TYPES,
  VALID_LEAVE_TYPES,
  LEAVE_TYPE_SETTINGS_KEYS,
  requiresAttachment,
  resolveIsPaidOnApproval,
  requiresPaidChoiceOnApproval,
};
