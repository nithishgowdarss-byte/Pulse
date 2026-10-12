// src/lib/offline/registerEntry.ts
import { callRpc } from '../rpc';
import { enqueue } from './outbox';
import { normalizePhone10 } from '../phone';

export async function submitRegisterEntry(input: {
  entryType: 'new' | 'renewal' | 'balance' | 'freeze';
  fullName: string;
  phone: string;
  gender?: string | null;
  months?: number | null;
  freezeDays?: number | null;
  amount: number;
  method: string;
  listPrice?: number | null;
  branchId?: string | null;
  notes?: string | null;
}) {
  const phone = normalizePhone10(input.phone);
  if (!phone) throw new Error('INVALID_PHONE');

  // Stable key: same logical desk line retries safely
  const keyPrefix = [
    'reg',
    input.entryType,
    phone,
    input.amount.toFixed(2),
    input.method,
    input.months ?? input.freezeDays ?? '',
  ].join(':');

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const payload = {
    p_entry_type: input.entryType,
    p_full_name: input.fullName,
    p_phone: phone,
    p_gender: input.gender ?? null,
    p_months: input.months ?? null,
    p_freeze_days: input.entryType === 'freeze' ? 30 : input.freezeDays ?? null,
    p_amount: input.amount,
    p_method: input.method,
    p_list_price: input.listPrice ?? null,
    p_branch_id: input.branchId ?? null,
    p_notes: input.notes ?? null,
    p_idempotency_key:
      typeof crypto !== 'undefined' && !isOnline
        ? `${keyPrefix}:${crypto.randomUUID()}`
        : `${keyPrefix}:${Math.floor(Date.now() / 30_000)}`,
  };

  if (!isOnline) {
    await enqueue({
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `op_${Date.now()}_${Math.random()}`,
      type: 'register_day_entry',
      createdAt: new Date().toISOString(),
      status: 'pending',
      attempts: 0,
      payload,
    });
    return { queued: true as const, balance_due: 0, balance_after: 0 };
  }

  const result = await callRpc<any>('register_day_entry', payload, {
    context: 'register_day_entry',
  });
  return { queued: false as const, ...result };
}
