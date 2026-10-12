// src/types/database-rpcs.ts

export type ActivateMemberArgs = {
  p_member_id: string;
  p_months: number;
  p_amount_paid: number;
  p_method: string;
  p_reference?: string | null;
  p_package_type?: string | null;
  p_idempotency_key?: string | null;
};

export type ActivateMemberResult = {
  member_id: string;
  end_date: string;
  balance_due: number;
  payment_id: string | null;
};

export type BulkUpdateMembersArgs = {
  p_member_ids: string[];
  p_status?: string | null;
  p_trainer_id?: string | null;
};

export type GetPayrollLinesArgs = {
  p_period_month: string; // YYYY-MM-DD
  p_branch_id?: string | null;
  p_trainer_id?: string | null;
  p_status?: string | null;
};

export type PayrollLine = {
  settlement_id: string;
  period_month: string;
  branch_id: string | null;
  branch_name: string | null;
  trainer_id: string | null;
  trainer_name: string | null;
  member_id: string | null;
  member_name: string | null;
  member_phone: string | null;
  payment_id: string | null;
  base_amount: number | null;
  rate_percent: number | null;
  commission_amount: number;
  package_type: string | null;
  status: 'pending' | 'paid' | 'void';
  notes: string | null;
  created_at: string;
  paid_at: string | null;
  paid_by_name: string | null;
};

import { parseResponseJson } from '../lib/apiUtils';

export type FlagStaleMembersArgs = { p_days?: number };
export type FlagStaleMembersResult = {
  flagged: number;
  days: number;
  ran_at: string;
};

/** Typed RPC helper for Activate Member */
export async function rpcActivateMember(args: ActivateMemberArgs): Promise<ActivateMemberResult> {
  const res = await fetch('/api/members/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = await parseResponseJson<any>(res, {});
  if (!res.ok) {
    throw new Error(data.error || 'Failed to activate member');
  }
  return data as ActivateMemberResult;
}

/** Typed RPC helper for Bulk Member updates */
export async function rpcBulkUpdateMembers(args: BulkUpdateMembersArgs): Promise<number> {
  const res = await fetch('/api/members/bulk-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = await parseResponseJson<any>(res, {});
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update members');
  }
  return typeof data.count === 'number' ? data.count : args.p_member_ids.length;
}

/** Typed RPC helper for Payroll Lines */
export async function rpcGetPayrollLines(args: GetPayrollLinesArgs): Promise<PayrollLine[]> {
  const params = new URLSearchParams();
  params.set('period_month', args.p_period_month);
  if (args.p_branch_id) params.set('branch_id', args.p_branch_id);
  if (args.p_trainer_id) params.set('trainer_id', args.p_trainer_id);
  if (args.p_status) params.set('status', args.p_status);

  const res = await fetch(`/api/payroll/lines?${params.toString()}`);
  const data = await parseResponseJson<any>(res, {});
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch payroll lines');
  }
  return (data.lines || data || []) as PayrollLine[];
}

/** Typed RPC helper for Stale Members calculation */
export async function rpcFlagStaleMembers(args: FlagStaleMembersArgs = {}): Promise<FlagStaleMembersResult> {
  const res = await fetch('/api/retention/calculate-risk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days: args.p_days ?? 14 }),
  });
  const data = await parseResponseJson<any>(res, {});
  if (!res.ok) {
    throw new Error(data.error || 'Failed to calculate risk');
  }
  return {
    flagged: data.flagged || 0,
    days: args.p_days ?? 14,
    ran_at: new Date().toISOString(),
  };
}
