// src/lib/logPromiseToPay.ts
import { safeFetchJson } from './apiUtils';
import { callRpc } from './rpc';

export type PromisePreset = 'tomorrow' | '3d' | 'next_week' | 'custom';

export function promiseDateFromPreset(preset: PromisePreset, custom?: string) {
  const today = new Date();
  if (preset === 'tomorrow') {
    today.setDate(today.getDate() + 1);
    return today.toISOString().slice(0, 10);
  }
  if (preset === '3d') {
    today.setDate(today.getDate() + 3);
    return today.toISOString().slice(0, 10);
  }
  if (preset === 'next_week') {
    today.setDate(today.getDate() + 7);
    return today.toISOString().slice(0, 10);
  }
  if (custom) return custom;
  today.setDate(today.getDate() + 1);
  return today.toISOString().slice(0, 10);
}

export async function logPromiseToPay(input: {
  memberId: string;
  branchId?: string | null;
  balanceDue: number;
  preset: PromisePreset;
  customDate?: string;
  actorId?: string;
  notes?: string;
}) {
  const promised_date = promiseDateFromPreset(input.preset, input.customDate);
  
  try {
    // Log via direct endpoint or RPC
    await safeFetchJson('/api/balance-reminders/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        member_id: input.memberId,
        branch_id: input.branchId || null,
        balance_due: input.balanceDue,
        channel: 'call',
        status: 'sent',
        outcome: 'promised',
        promised_date,
        error_message: input.notes ? `PTP note: ${input.notes}` : undefined,
        actor_id: input.actorId || null,
      }),
    });
  } catch (err) {
    console.warn('Could not log promise to pay:', err);
  }

  return promised_date;
}
