// src/lib/retry.ts

export type RetryOpts = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
};

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function fullJitter(attempt: number, base: number, max: number): number {
  const exp = Math.min(max, base * 2 ** (attempt - 1));
  return Math.floor(Math.random() * exp);
}

export function isTransient(err: unknown): boolean {
  const e = err as any;
  const status = Number(e?.status || e?.statusCode || 0);
  const msg = String(e?.message || e || '').toLowerCase();
  const code = String(e?.code || '');

  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  if (['RATE_LIMITED', 'MSG91_HTTP_ERROR', 'VAULT_READ_FAILED', 'NETWORK'].includes(code)) {
    return true;
  }
  if (/timeout|network|fetch|econnreset|temporar|unavailable|429|502|503/i.test(msg)) {
    return true;
  }
  // Never retry auth / validation / forbidden
  if ([400, 401, 403, 404, 422].includes(status)) return false;
  if (/AUTH_SESSION|FORBIDDEN|INVALID_|MSG91_AUTH_FAILED|DLT_TEMPLATE_MISSING/i.test(msg)) {
    return false;
  }
  return false;
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOpts = {}
): Promise<T> {
  const max = opts.maxAttempts ?? 3;
  const base = opts.baseDelayMs ?? 400;
  const maxDelay = opts.maxDelayMs ?? 8000;
  const should = opts.shouldRetry ?? ((err) => isTransient(err));

  let last: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      last = err;
      if (attempt >= max || !should(err, attempt)) break;
      await sleep(fullJitter(attempt, base, maxDelay));
    }
  }
  throw last;
}
