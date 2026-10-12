import crypto from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

// ---------- PIN hashing (scrypt) ----------
const SCRYPT_N = 16384;
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, 32, { N: SCRYPT_N, r: 8, p: 1 });
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function verifyPin(pin: string, stored: string | undefined): boolean {
  if (!stored || typeof pin !== 'string') return false;
  const [algo, n, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(pin, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}
export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin);
}

// ---------- Sessions (HMAC-signed cookie) ----------
export type SessionKind = 'staff' | 'member';
export interface Session {
  kind: SessionKind;
  id: string;
  role: string; // super_owner | owner | branch_manager | trainer | member
  exp: number;
  pv?: string; // PIN version: sessions die when the PIN is reset
}
export const SESSION_COOKIE = 'pulse_session';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS || 12) * 3600_000;

let sessionSecret: string | null = null;
export function getSessionSecret(): string {
  if (sessionSecret) return sessionSecret;
  const env = process.env.SESSION_SECRET;
  if (env && env.length >= 32) return (sessionSecret = env);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET (>= 32 chars) is required in production');
  }
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] SESSION_SECRET not set; generated an ephemeral dev secret (sessions reset on restart)');
  return sessionSecret;
}
function sign(data: string) {
  return crypto.createHmac('sha256', getSessionSecret()).update(data).digest('base64url');
}
export function encodeSession(s: Omit<Session, 'exp'>, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...s, exp: now + SESSION_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
export function decodeSession(token: string | undefined, now = Date.now()): Session | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
    if (!s || typeof s.exp !== 'number' || s.exp < now) return null;
    return s;
  } catch {
    return null;
  }
}
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function sessionCookie(token: string, maxAgeMs = SESSION_TTL_MS): string {
  const secure = process.env.NODE_ENV === 'production' && process.env.COOKIE_INSECURE !== '1' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`;
}
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

// ---------- Login throttling / lockout ----------
export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60_000;
const attempts = new Map<string, { fails: number; lockedUntil: number }>();
export const loginThrottle = {
  isLocked(key: string, now = Date.now()) {
    const a = attempts.get(key);
    return !!a && a.lockedUntil > now ? Math.ceil((a.lockedUntil - now) / 1000) : 0;
  },
  fail(key: string, now = Date.now()) {
    const a = attempts.get(key) || { fails: 0, lockedUntil: 0 };
    a.fails++;
    if (a.fails >= MAX_ATTEMPTS) { a.lockedUntil = now + LOCK_MS; a.fails = 0; }
    attempts.set(key, a);
  },
  success(key: string) { attempts.delete(key); },
  reset() { attempts.clear(); },
};

// ---------- Authorization ----------
export interface AuthzContext {
  session: Session;
  branchIds: string[] | null; // null = all branches
  memberBranch: (memberId: string) => string | undefined;
}
type Rule = [method: string, path: RegExp];
const R = (m: string, p: string): Rule => [m, new RegExp(`^${p}$`)];

export const OWNER_ROLES = ['super_owner', 'owner'];
const SUPER_ONLY: Rule[] = [R('*', '/api/auth/pins(/.*)?'), R('*', '/api/reset-seed'), R('DELETE', '/api/members/[^/]+')];

// Branch managers: everything staff-facing for their branch, but no global config.
const MANAGER_DENY: Rule[] = [
  R('*', '/api/freellmapi/(update-config|test-provider)'),
  R('POST', '/api/branches'), R('PUT', '/api/branches/[^/]+'),
  R('*', '/api/branches/[^/]+/sms-config(/.*)?'), R('*', '/api/dlt-templates(/.*)?'),
  R('*', '/api/rpc/.*'), R('*', '/v1/.*'), R('POST', '/api/automation-rules'),
];

const TRAINER_ALLOW: Rule[] = [
  R('GET', '/api/(announcements|attendance|members|trainers|profiles|branches|day-register|notifications|freeze-requests|crm-activities|leads|churn/predictions|trainer-payroll|payroll/lines|payroll-lines|commission-settlements|staff-attendance|freellmapi/status)'),
  R('GET', '/api/members/[^/]+/(measurements|payments)'),
  R('GET', '/api/retention/(alerts|stale-members|churn-risk-distribution|risk-score/[^/]+)'),
  R('GET', '/api/staff-attendance/open-shift/[^/]+'),
  R('POST', '/api/attendance/check-in'),
  R('POST', '/api/members'),
  R('POST', '/api/members/[^/]+/(payment|renew|measurements|freeze|activate)'),
  R('POST', '/api/notifications/([^/]+/read|read-all)'),
  R('POST', '/api/(crm-activities|leads|freeze-requests|contacts/parse-preview)'),
  R('POST', '/api/freellmapi/(workout-plan|diet-plan|coach-chat)'),
];

const MEMBER_ALLOW: Rule[] = [
  R('GET', '/api/(members|announcements|branches|attendance|freeze-requests|trainers)'),
  R('GET', '/api/members/[^/]+/(measurements|payments)'),
  R('POST', '/api/members/[^/]+/freeze'),
  R('POST', '/api/freeze-requests'),
  R('POST', '/api/attendance/check-in'),
  R('POST', '/api/freellmapi/(coach-chat|workout-plan|diet-plan)'),
];

const match = (rules: Rule[], method: string, path: string) =>
  rules.some(([m, re]) => (m === '*' || m === method) && re.test(path));

const MEMBER_ID_IN_PATH = [/^\/api\/members\/([^/]+)\//, /^\/api\/autodebit\/attempts\/([^/]+)$/, /^\/api\/retention\/risk-score\/([^/]+)$/];
const STAFF_ID_IN_PATH = /^\/api\/staff-attendance\/open-shift\/([^/]+)$/;

/** Returns null when allowed, or an error message when denied. */
export function authorize(ctx: AuthzContext, method: string, path: string, body: any, query: any): string | null {
  const { session } = ctx;
  if (match(SUPER_ONLY, method, path)) return session.role === 'super_owner' ? null : 'Only the super owner can do this';
  if (OWNER_ROLES.includes(session.role)) return null;

  if (session.role === 'branch_manager' && match(MANAGER_DENY, method, path)) return 'Not allowed for branch managers';
  if (session.role === 'trainer' && !match(TRAINER_ALLOW, method, path)) return 'Not allowed for trainers';
  if (session.role === 'member' && !match(MEMBER_ALLOW, method, path)) return 'Not allowed for members';
  if (!['branch_manager', 'trainer', 'member'].includes(session.role)) return 'Unknown role';

  const b = body && typeof body === 'object' ? body : {};
  const q = query || {};
  const memberIds = new Set<string>();
  for (const re of MEMBER_ID_IN_PATH) { const m = path.match(re); if (m) memberIds.add(decodeURIComponent(m[1])); }
  for (const v of [b.member_id, b.p_member_id, q.member_id, q.p_member_id, q.memberId, b.memberId, path === '/api/members/activate' ? b.id : undefined]) if (typeof v === 'string' && v) memberIds.add(v);
  for (const arr of [b.member_ids, b.memberIds, b.ids, b.p_member_ids]) if (Array.isArray(arr)) for (const v of arr) if (typeof v === 'string') memberIds.add(v);

  if (session.role === 'member') {
    for (const id of memberIds) if (id !== session.id) return 'Members can only access their own records';
    if (method === 'POST' && /^\/api\/(freeze-requests|attendance\/check-in)$/.test(path) && b.member_id !== session.id) {
      return 'Members can only act on their own record';
    }
    return null;
  }

  // trainer / branch_manager: branch scope
  const allowed = ctx.branchIds || [];
  for (const id of memberIds) {
    const br = ctx.memberBranch(id);
    if (!br || !allowed.includes(br)) return 'Member is outside your branch';
  }
  for (const v of [b.branch_id, b.p_branch_id, q.branch_id, q.p_branch_id, b.to_branch_id]) {
    if (typeof v === 'string' && v && v !== 'all' && v !== 'auto' && !allowed.includes(v)) return 'Branch is outside your scope';
  }
  if (session.role === 'trainer') {
    const sm = path.match(STAFF_ID_IN_PATH);
    if (sm && sm[1] !== session.id) return 'Trainers can only view their own shifts';
    for (const v of [q.trainer_id, q.p_trainer_id, q.staff_id, b.trainer_id]) {
      if (typeof v === 'string' && v && v !== session.id && /payroll|commission|staff-attendance/.test(path)) return 'Trainers can only view their own payroll';
    }
  }
  return null;
}

/** Filters list responses down to what a scoped role may see. */
export function filterResponse(ctx: AuthzContext, path: string, body: any): any {
  const { session } = ctx;
  if (OWNER_ROLES.includes(session.role)) return body;
  const allowed = new Set(ctx.branchIds || []);
  const ownPayroll = session.role === 'trainer' && /payroll|commission|staff-attendance/.test(path);

  const keep = (item: any): boolean => {
    if (!item || typeof item !== 'object') return true;
    if (session.role === 'member') {
      if (path === '/api/members') return item.id === session.id;
      if ('member_id' in item) return item.member_id === session.id;
      if (path === '/api/trainers') return true;
      if ('branch_id' in item && item.branch_id && path !== '/api/branches') return item.branch_id === ctx.memberBranch(session.id);
      return true;
    }
    if (ownPayroll && ('trainer_id' in item || 'staff_id' in item)) return (item.trainer_id ?? item.staff_id) === session.id;
    if (path === '/api/profiles' || path === '/api/trainers') {
      return item.id === session.id || (item.branch_id && allowed.has(item.branch_id));
    }
    if ('branch_id' in item && item.branch_id) return allowed.has(item.branch_id);
    if ('member_id' in item && item.member_id) { const br = ctx.memberBranch(item.member_id); return !!br && allowed.has(br); }
    return true;
  };
  const filterArr = (a: any[]) => a.filter(keep);
  if (Array.isArray(body)) return filterArr(body);
  if (body && typeof body === 'object') {
    const out: any = { ...body };
    for (const [k, v] of Object.entries(out)) if (Array.isArray(v)) out[k] = filterArr(v as any[]);
    return out;
  }
  return body;
}

export function readSession(req: Request): Session | null {
  return decodeSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
}

export const PUBLIC_API = [/^\/api\/auth\/me$/, /^\/api\/auth\/login$/, /^\/api\/auth\/logout$/, /^\/api\/health$/];

export function createAuthMiddleware(resolve: {
  sessionValid: (s: Session) => boolean;
  branchIdsFor: (s: Session) => string[] | null;
  memberBranch: (id: string) => string | undefined;
}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = req.originalUrl.split('?')[0];
    if (!(path.startsWith('/api/') || path.startsWith('/v1/'))) return next();
    if (PUBLIC_API.some((re) => re.test(path))) return next();
    if (path === '/api/webhooks/whatsapp-reply') {
      const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
      const got = String(req.headers['x-webhook-secret'] || '');
      if (secret && got.length === secret.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return next();
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }
    const session = readSession(req);
    if (!session || !resolve.sessionValid(session)) {
      return res.status(401).json({ error: 'Login required', code: 'AUTH_REQUIRED' });
    }
    const ctx: AuthzContext = { session, branchIds: resolve.branchIdsFor(session), memberBranch: resolve.memberBranch };
    (req as any).auth = ctx;
    const denied = authorize(ctx, req.method, path, req.body, req.query);
    if (denied) return res.status(403).json({ error: denied, code: 'FORBIDDEN' });
    // Branch-scoped staff always create records in their own branch (no auto-routing elsewhere)
    if ((session.role === 'trainer' || session.role === 'branch_manager') && req.method === 'POST' && req.body && typeof req.body === 'object' &&
        /^\/api\/(members|leads|contacts\/parse-preview)$/.test(path) && (!req.body.branch_id || req.body.branch_id === 'auto' || req.body.branch_id === 'all')) {
      req.body.branch_id = (ctx.branchIds || [])[0];
    }
    if (!OWNER_ROLES.includes(session.role)) {
      const json = res.json.bind(res);
      res.json = (b: any) => json(filterResponse(ctx, path, b));
    }
    next();
  };
}
