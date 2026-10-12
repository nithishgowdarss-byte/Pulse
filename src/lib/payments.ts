// src/lib/payments.ts
import { parseResponseJson } from './apiUtils';

export function makePaymentIdempotencyKey(parts: {
  memberId: string;
  amount: number;
  method: string;
  // bucket to 30s window so double-clicks collide, intentional retries can pass new key
  windowMs?: number;
}) {
  const window = parts.windowMs ?? 30_000;
  const bucket = Math.floor(Date.now() / window);
  // Stable for double-submit; change if user deliberately pays again later
  return [
    'pay',
    parts.memberId,
    Number(parts.amount).toFixed(2),
    parts.method,
    bucket,
  ].join(':');
}

export async function recordPayment(input: {
  memberId: string;
  branchId: string;
  amount: number;
  method: string;
  reference?: string;
  packageType?: string;
  recordedBy?: string;
}) {
  const idempotency_key = makePaymentIdempotencyKey({
    memberId: input.memberId,
    amount: input.amount,
    method: input.method,
  });

  const res = await fetch('/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      member_id: input.memberId,
      branch_id: input.branchId,
      amount: input.amount,
      method: input.method,
      reference: input.reference ?? null,
      package_type: input.packageType ?? null,
      recorded_by: input.recordedBy,
      idempotency_key, // hidden from UI
    }),
  });

  const data = await parseResponseJson<any>(res, {});

  if (!res.ok) {
    throw new Error(data.error || 'Payment recording failed');
  }

  return data;
}
