// src/types/dlt.ts

export type DltPurpose =
  | 'expiry_7d'
  | 'expiry_3d'
  | 'winback'
  | 'payment_reminder'
  | 'stale_nudge'
  | 'otp'
  | 'custom';

export type DltVariable = { key: string; label: string };

export type DltTemplate = {
  id: string;
  branch_id: string | null;
  name: string;
  purpose: DltPurpose;
  msg91_template_id: string;
  sender_id: string | null;
  variable_schema: DltVariable[];
  sample_body: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export const DLT_PURPOSE_LABELS: Record<DltPurpose, string> = {
  expiry_7d: 'Expiry Reminder (7 Days Prior)',
  expiry_3d: 'Urgent Expiry (3 Days Prior)',
  winback: 'Win-Back Campaign',
  payment_reminder: 'Payment & Dues Reminder',
  stale_nudge: 'Stale Member Check-in Nudge',
  otp: 'Login & Verification OTP',
  custom: 'Custom Announcement',
};
