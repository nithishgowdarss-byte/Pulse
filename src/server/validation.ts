import type { RequestHandler } from 'express';

/** Numeric body fields and their allowed inclusive ranges. */
export const NUMERIC_FIELD_RULES: Record<string, [number, number]> = {
  amount: [0, 10_000_000],
  amount_paid: [0, 10_000_000],
  amtPaid: [0, 10_000_000],
  balance_due: [0, 10_000_000],
  balDue: [0, 10_000_000],
  total_commission: [0, 10_000_000],
  budget: [0, 100_000_000],
  commission_rate: [0, 100],
  commRateInput: [0, 100],
  subscription_months: [1, 60],
  subMonths: [1, 60],
  age: [0, 120],
  weight_kg: [1, 500],
  body_fat_pct: [0, 100],
};

export const MAX_STRING_LENGTH = 10_000;
const PHONE_FIELDS = ['phone', 'emergency_contact'];

export function validateBody(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  for (const [field, [min, max]] of Object.entries(NUMERIC_FIELD_RULES)) {
    const v = b[field];
    if (v === undefined || v === null || v === '') continue;
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (!Number.isFinite(n)) return `${field} must be a number`;
    if (n < min || n > max) return `${field} must be between ${min} and ${max}`;
  }
  for (const f of PHONE_FIELDS) {
    const v = b[f];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string' && typeof v !== 'number') return `${f} must be a string`;
    if (String(v).replace(/\D/g, '').length > 15) return `${f} is too long`;
    if (typeof v === 'number') b[f] = String(v);
  }
  if (b.messages !== undefined) {
    if (!Array.isArray(b.messages) || b.messages.length > 40) return 'messages must be an array of at most 40 items';
    for (const m of b.messages as any[]) {
      if (!m || typeof m !== 'object' || typeof m.content !== 'string' || m.content.length > 8000) return 'each message needs string content up to 8000 chars';
      if (m.role !== undefined && !['user', 'assistant', 'system'].includes(m.role)) return 'invalid message role';
    }
  }
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'string' && v.length > MAX_STRING_LENGTH) return `${k} is too long`;
  }
  return null;
}

export const bodyValidator: RequestHandler = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const err = validateBody(req.body);
  if (err) return res.status(400).json({ error: err, code: 'VALIDATION_ERROR' });
  next();
};
