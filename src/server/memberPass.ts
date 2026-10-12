import crypto from 'crypto';

/** Signed, expiring member pass encoded in the member's QR code. Format: PULSE1.<memberId>.<expMs>.<sig> */
const PREFIX = 'PULSE1';
export const PASS_TTL_MS = 24 * 60 * 60 * 1000;

function sign(secret: string, body: string) {
  return crypto.createHmac('sha256', `member-pass:${secret}`).update(body).digest('base64url').slice(0, 22);
}

export function issuePass(secret: string, memberId: string, now = Date.now()) {
  const exp = now + PASS_TTL_MS;
  const body = `${PREFIX}.${memberId}.${exp}`;
  return { token: `${body}.${sign(secret, body)}`, expires_at: new Date(exp).toISOString() };
}

export type PassCheck = { ok: boolean; memberId?: string; reason?: 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' };

export function verifyPass(secret: string, token: unknown, now = Date.now()): PassCheck {
  if (typeof token !== 'string' || token.length > 200) return { ok: false, reason: 'MALFORMED' };
  const parts = token.trim().split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX || !/^[A-Za-z0-9_-]{1,64}$/.test(parts[1]) || !/^\d{10,16}$/.test(parts[2])) return { ok: false, reason: 'MALFORMED' };
  const body = parts.slice(0, 3).join('.');
  const want = Buffer.from(sign(secret, body));
  const got = Buffer.from(parts[3]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return { ok: false, reason: 'BAD_SIGNATURE' };
  if (Number(parts[2]) < now) return { ok: false, reason: 'EXPIRED' };
  return { ok: true, memberId: parts[1] };
}
