// src/lib/domain.ts
export const RISK_REASONS = {
  NEVER_VISITED: 'Never checked in',
  STALE_14: 'No visit ≥14 days',
  STALE_21: 'No visit ≥21 days',
  STALE_30: 'No visit ≥30 days',
  ATTENDANCE_DROP: 'Attendance drop ≥50%',
  EXPIRING_7: 'Expiring ≤7 days',
  EXPIRING_3: 'Expiring ≤3 days',
  EXPIRED: 'Membership expired',
  DUES: 'Outstanding dues',
} as const;

export type RiskReasonKey = keyof typeof RISK_REASONS;
export type RiskReasonValue = (typeof RISK_REASONS)[RiskReasonKey];

export const ATTENDANCE_ERRORS: Record<string, string> = {
  already_checked_in_today: 'Already checked in today',
  membership_expired: 'Membership expired',
  member_archived: 'Member is archived',
  balance_due: 'Entry blocked — outstanding dues',
  member_not_found: 'Member not found',
  member_status_pending: 'Membership not activated yet',
  invalid_qr: 'Invalid Pulse member QR',
  phone_mismatch: 'QR does not match member phone',
  forbidden_branch: 'Member belongs to a different branch',
};

export function mapAttendanceError(message: string): string {
  if (!message) return 'Check-in failed';
  const lower = message.toLowerCase();
  for (const [k, v] of Object.entries(ATTENDANCE_ERRORS)) {
    if (lower.includes(k.toLowerCase()) || lower.includes(v.toLowerCase())) return v;
  }
  if (/load failed|failed to fetch|network/i.test(message)) {
    return 'Network error — try again';
  }
  return message;
}
