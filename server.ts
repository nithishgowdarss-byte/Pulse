import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import {
  Profile,
  Member,
  MemberStatus,
  PlanPackage,
  PaymentMethod,
  AttendanceRecord,
  ExportLogRecord,
  CommissionSettlement,
  PaymentRecord,
  Branch,
  CRMActivity,
  Lead,
  AutomationRule,
  AutomationLog,
  AuditLog,
  MemberFreezeRequest,
  MemberMeasurement,
  GymAnnouncement,
  MemberRiskScore,
  RetentionAlert,
  AutoDebitAttempt,
  RetentionOutreachLog,
  StaffNotification,
  MemberChurnPrediction,
  WinbackCampaign,
  WinbackEnrollment,
  WinbackAttempt,
  PayrollSettlementLine,
  ChurnFactor,
  BalanceReminderLog,
  BalanceReminderSettings,
  BalanceReminderTarget,
  DayRegisterEntry,
  DayRegisterSummary
} from './src/types';
import { PACKAGE_CONFIGS } from './src/lib/membership';
import { BANNER_TYPES, THEMES, FESTIVALS, templateCopy, parseAiCopy, bannerPrompt, BannerInput, BannerCopy } from './src/lib/bannerTemplates';
import { getDefaultCommissionRate, calculateCommissionAmount } from './src/lib/commission';
import { evaluateAutomations, DEFAULT_AUTOMATION_RULES } from './src/lib/automationEngine';
import {
  executeFreeLLMCompletion,
  getFreeLLMStatus,
  updateProviderConfig,
  testProviderLatency,
  generateGymWorkoutPlan,
  generateGymDietPlan,
  PROVIDER_CATALOG
} from './src/lib/freellmapiEngine';
import { LLMProviderId, FreeLLMChatMessage } from './src/types';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

import { securityHeaders, createRateLimiter, requestLogger, errorHandler, isProduction, createBasicAuthGate } from './src/server/http';
import { createPersistence } from './src/server/persistence';
import { createSqliteStore } from './src/server/sqliteStore';
import { bodyValidator } from './src/server/validation';
import { createVault, getSecretsKey, SealedSecret } from './src/server/secrets';
import {
  hashPin, verifyPin, isValidPinFormat, encodeSession, sessionCookie, clearSessionCookie,
  loginThrottle, createAuthMiddleware, getSessionSecret, Session, readSession,
} from './src/server/auth';

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
app.use(securityHeaders);
app.use(requestLogger);
app.use(createBasicAuthGate(process.env.PULSE_BASIC_AUTH));
if (isProduction() && !process.env.PULSE_BASIC_AUTH) {
  console.warn('[security] PULSE_BASIC_AUTH not set (optional extra perimeter login on top of PIN auth).');
}
app.use(express.json({ limit: process.env.JSON_LIMIT || '1mb' }));
app.use('/api', bodyValidator);
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    res.on('finish', () => { if (res.statusCode < 400) persistence?.markDirty(); });
  }
  next();
});
app.use('/api/freellmapi', createRateLimiter({ windowMs: 60_000, max: Number(process.env.AI_RATE_LIMIT_PER_MIN) || 20 }));
app.use('/api', createRateLimiter({ windowMs: 60_000, max: Number(process.env.API_RATE_LIMIT_PER_MIN) || 600 }));


// ---------------- Authentication (per-person PIN) ----------------
// PIN hashes live apart from profiles/members so they are never returned by list endpoints.
let pinHashes: Record<string, string> = {};
// Encrypted third-party secrets (MSG91 auth keys...), keyed by vault_secret_id. Never returned by any API.
let secretVault: Record<string, SealedSecret> = {};
const vault = createVault(() => secretVault);
const OWNER_SET = new Set(['super_owner', 'owner']);
const DEV_PINS: Record<string, string> = {
  usr_super_1: '1111', usr_owner_1: '2222', usr_manager_1: '3333',
  usr_trainer_1: '4444', usr_trainer_2: '4444', usr_trainer_3: '4444', usr_trainer_4: '4444', usr_trainer_5: '4444',
};
function seedPins() {
  if (isProduction() && process.env.PULSE_SEED_DEV_PINS !== '1') {
    const boot = process.env.SUPER_OWNER_PIN;
    if (!pinHashes.usr_super_1 && boot && isValidPinFormat(boot)) pinHashes.usr_super_1 = hashPin(boot);
    return;
  }
  for (const [id, pin] of Object.entries(DEV_PINS)) if (!pinHashes[id]) pinHashes[id] = hashPin(pin);
  for (const m of members) if (!pinHashes[m.id]) pinHashes[m.id] = hashPin('5555');
}
const pinVersion = (id: string) => (pinHashes[id] || '').split('$')[2]?.slice(0, 10) || '';
const cleanPhone10 = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-10);
const isMemberActiveAccount = (m: any) => m && !m.is_archived && !m.archived_at;

function staffBranchIds(p: Profile | undefined): string[] {
  if (!p) return [];
  return p.assigned_branch_ids?.length ? p.assigned_branch_ids : p.branch_id ? [p.branch_id] : [];
}
function sessionProfile(s: Session): any {
  if (s.kind === 'staff') return profiles.find((p) => p.id === s.id) || null;
  const m: any = members.find((x) => x.id === s.id);
  if (!m) return null;
  return { id: m.id, full_name: m.full_name, role: 'member', phone: m.phone, email: m.email, branch_id: m.branch_id, branch_name: m.branch_name, created_at: m.created_at };
}

app.post('/api/auth/login', (req, res) => {
  const phone = cleanPhone10(req.body?.phone);
  const pin = req.body?.pin;
  if (phone.length !== 10 || !isValidPinFormat(pin)) {
    return res.status(400).json({ error: 'Enter your 10-digit phone number and 4-8 digit PIN', code: 'BAD_INPUT' });
  }
  const ipKey = `ip:${req.ip}`;
  const acctKey = `acct:${phone}`;
  const locked = loginThrottle.isLocked(acctKey) || loginThrottle.isLocked(ipKey);
  if (locked) {
    res.setHeader('Retry-After', String(locked));
    return res.status(429).json({ error: `Too many wrong PINs. Try again in ${Math.ceil(locked / 60)} min.`, code: 'LOCKED' });
  }
  const candidates: { kind: 'staff' | 'member'; id: string; role: string }[] = [
    ...profiles.filter((p) => cleanPhone10(p.phone) === phone).map((p) => ({ kind: 'staff' as const, id: p.id, role: p.role })),
    ...members.filter((m: any) => cleanPhone10(m.phone) === phone && isMemberActiveAccount(m)).map((m) => ({ kind: 'member' as const, id: m.id, role: 'member' })),
  ];
  // Try every candidate so timing does not reveal which phones exist
  let hit: (typeof candidates)[number] | null = null;
  for (const c of candidates) if (verifyPin(pin, pinHashes[c.id]) && !hit) hit = c;
  if (!candidates.length) verifyPin(pin, hashPin('0000'));
  if (!hit && candidates.length && candidates.every((c) => !pinHashes[c.id])) {
    loginThrottle.fail(acctKey);
    const memberOnly = candidates.every((c) => c.kind === 'member');
    return res.status(403).json({
      error: memberOnly
        ? 'Your account does not have a PIN yet. Please ask the front desk at your branch to set one for you.'
        : 'No PIN has been set for this account yet. Please ask the owner to set one.',
      code: 'NO_PIN',
    });
  }
  if (!hit) {
    loginThrottle.fail(acctKey);
    loginThrottle.fail(ipKey);
    return res.status(401).json({ error: 'Wrong phone number or PIN', code: 'BAD_CREDENTIALS' });
  }
  loginThrottle.success(acctKey);
  const token = encodeSession({ kind: hit.kind, id: hit.id, role: hit.role, pv: pinVersion(hit.id) });
  res.setHeader('Set-Cookie', sessionCookie(token));
  auditLogs.unshift({ id: `aud_${Date.now()}`, actor_id: hit.id, action: 'auth.login', entity_type: 'session', entity_id: hit.id, created_at: new Date().toISOString() } as any);
  res.json({ kind: hit.kind, profile: sessionProfile({ ...hit, exp: 0 }) });
});

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.json({ success: true });
});

app.use(
  createAuthMiddleware({
    sessionValid: (s) => !!sessionProfile(s) && (s.kind !== 'member' || isMemberActiveAccount(members.find((m) => m.id === s.id))) && s.pv === pinVersion(s.id) && !!pinHashes[s.id],
    branchIdsFor: (s) => (s.role === 'super_owner' || s.role === 'owner' ? null : s.kind === 'member' ? [] : staffBranchIds(profiles.find((p) => p.id === s.id))),
    memberBranch: (id) => members.find((m) => m.id === id)?.branch_id,
    entityBranch: (p) => {
      const mb = (id?: string) => (id ? members.find((m) => m.id === id)?.branch_id : undefined);
      let m: RegExpMatchArray | null;
      if ((m = p.match(/^\/api\/freeze-requests\/([^/]+)$/))) { const r = freezeRequests.find((x) => x.id === m![1]); return r ? r.branch_id || mb(r.member_id) || '' : undefined; }
      if ((m = p.match(/^\/api\/leads\/([^/]+)(\/convert)?$/))) { const r = leads.find((x) => x.id === m![1]); return r ? r.branch_id || '' : undefined; }
      if ((m = p.match(/^\/api\/retention\/alerts\/([^/]+)\/resolve$/))) { const r = retentionAlerts.find((x) => x.id === m![1]); return r ? r.branch_id || mb(r.member_id) || '' : undefined; }
      if ((m = p.match(/^\/api\/winback\/enrollments\/([^/]+)/))) { const r = winbackEnrollments.find((x) => x.id === m![1]); return r ? r.branch_id || mb(r.member_id) || '' : undefined; }
      return undefined;
    },
    entityOwner: (p) => {
      const m = p.match(/^\/api\/notifications\/([^/]+)\/read$/);
      if (!m) return undefined;
      return staffNotifications.find((n) => n.id === m[1])?.user_id;
    },
  })
);

// Public: answers 200 with profile null when signed out (avoids noisy 401s on first load)
app.get('/api/auth/me', (req, res) => {
  const s = readSession(req);
  const valid = s && sessionProfile(s) && s.pv === pinVersion(s.id) && !!pinHashes[s.id] && (s.kind !== 'member' || isMemberActiveAccount(members.find((m) => m.id === s.id)));
  res.setHeader('Cache-Control', 'no-store');
  res.json(valid ? { kind: s!.kind, profile: sessionProfile(s!) } : { kind: null, profile: null });
});

// PIN administration: super owner only (enforced again in authorize())
app.get('/api/auth/pins', (_req, res) => {
  res.json([
    ...profiles.map((p) => ({ id: p.id, kind: 'staff', name: p.full_name, role: p.role, phone: p.phone, has_pin: !!pinHashes[p.id] })),
    ...members.map((m) => ({ id: m.id, kind: 'member', name: m.full_name, role: 'member', phone: m.phone, has_pin: !!pinHashes[m.id] })),
  ]);
});
app.put('/api/auth/pins/:id', (req, res) => {
  const { id } = req.params;
  const pin = req.body?.pin;
  if (!profiles.some((p) => p.id === id) && !members.some((m) => m.id === id)) return res.status(404).json({ error: 'User not found' });
  if (!isValidPinFormat(pin)) return res.status(400).json({ error: 'PIN must be 4-8 digits' });
  if (/^(\d)\1+$/.test(pin) && isProduction()) return res.status(400).json({ error: 'PIN is too simple' });
  pinHashes[id] = hashPin(pin);
  const actor = (req as any).auth.session.id;
  auditLogs.unshift({ id: `aud_${Date.now()}`, actor_id: actor, action: 'auth.pin_set', entity_type: 'user', entity_id: id, created_at: new Date().toISOString() } as any);
  res.json({ success: true, id });
});
app.delete('/api/auth/pins/:id', (req, res) => {
  delete pinHashes[req.params.id];
  res.json({ success: true, id: req.params.id });
});

// Liveness / readiness probe (used by Docker HEALTHCHECK)
app.get(['/healthz', '/api/health'], (_req, res) => {
  const dbOk = (persistence as any)?.ping ? (persistence as any).ping() : true;
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', db: dbOk ? 'ok' : 'unreachable', uptimeSec: Math.round(process.uptime()), persistence: persistence?.describe() ?? 'disabled', time: new Date().toISOString() });
});

// Destructive developer endpoints are disabled in production unless explicitly allowed
const devEndpointsAllowed = !isProduction() || process.env.PULSE_ALLOW_DEV_ENDPOINTS === '1';
app.use(['/api/reset-seed'], (req, res, next) => {
  if (!devEndpointsAllowed) return res.status(403).json({ error: 'Disabled in production', code: 'DEV_ENDPOINT_DISABLED' });
  next();
});
app.delete('/api/members/:id', (req, res, next) => {
  if (!devEndpointsAllowed) return res.status(403).json({ error: 'Hard delete disabled in production; archive instead', code: 'DEV_ENDPOINT_DISABLED' });
  next();
});

// Multi-Branch Seed Data (3 Owned & Operated Locations)
let branches: Branch[] = [
  {
    id: 'br_nag_1',
    name: 'Pulse Fitness - Nagarabhavi',
    code: 'NAG01',
    city: 'Bangalore',
    address: '80 Feet Road, 2nd Stage, Nagarabhavi, Bangalore - 560072',
    phone: '9876543210',
    email: 'nagarabhavi@pulsefitness.in',
    gst_number: '29AAAAA0000A1Z5',
    is_active: true,
    created_at: new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: 'br_rr_2',
    name: 'Pulse Fitness - RR Nagar',
    code: 'RRN02',
    city: 'Bangalore',
    address: 'Ideal Homes Township, Rajarajeshwari Nagar, Bangalore - 560098',
    phone: '9876543211',
    email: 'rrnagar@pulsefitness.in',
    gst_number: '29AAAAA0000A1Z5',
    is_active: true,
    created_at: new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: 'br_bsk_3',
    name: 'Pulse Fitness - Banashankari',
    code: 'BSK03',
    city: 'Bangalore',
    address: 'Outer Ring Road, 3rd Stage, Banashankari, Bangalore - 560085',
    phone: '9876543212',
    email: 'banashankari@pulsefitness.in',
    gst_number: '29AAAAA0000A1Z5',
    is_active: true,
    created_at: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()
  }
];

// In-Memory Database with Seed
let profiles: Profile[] = [
  {
    id: 'usr_super_1',
    full_name: 'Bipin Amrutha (Super Owner)',
    role: 'super_owner',
    phone: '9876543210',
    email: 'bipin.amrutha@pulsefitness.in',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    gym_name: 'Pulse Fitness Bangalore (3 Owned Branches)',
    branch_id: 'br_nag_1',
    branch_name: 'Pulse Fitness - Nagarabhavi',
    assigned_branch_ids: ['br_nag_1', 'br_rr_2', 'br_bsk_3'],
    created_at: new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 'usr_owner_1',
    full_name: 'Bipin Amrutha',
    role: 'owner',
    phone: '9876543210',
    email: 'bipin.amrutha@pulsefitness.in',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    gym_name: 'Pulse Fitness - Nagarabhavi',
    branch_id: 'br_nag_1',
    branch_name: 'Pulse Fitness - Nagarabhavi',
    assigned_branch_ids: ['br_nag_1', 'br_rr_2', 'br_bsk_3'],
    created_at: new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 'usr_manager_1',
    full_name: 'Rohan Mehta',
    role: 'branch_manager',
    phone: '9822334455',
    email: 'rohan.mehta@pulsefitness.in',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80',
    gym_name: 'Pulse Fitness - RR Nagar',
    branch_id: 'br_rr_2',
    branch_name: 'Pulse Fitness - RR Nagar',
    assigned_branch_ids: ['br_rr_2'],
    created_at: new Date(Date.now() - 150 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 'usr_trainer_1',
    full_name: 'Vishal',
    role: 'trainer',
    phone: '9812345671',
    email: 'vishal@pulsefitness.in',
    avatar: 'https://images.unsplash.com/photo-1567013127542-490d757e51fc?auto=format&fit=crop&w=200&q=80',
    gym_name: 'Pulse Fitness - Nagarabhavi',
    branch_id: 'br_nag_1',
    branch_name: 'Pulse Fitness - Nagarabhavi',
    created_at: new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 'usr_trainer_2',
    full_name: 'Manju',
    role: 'trainer',
    phone: '9898765432',
    email: 'manju@pulsefitness.in',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80',
    gym_name: 'Pulse Fitness - Nagarabhavi',
    branch_id: 'br_nag_1',
    branch_name: 'Pulse Fitness - Nagarabhavi',
    created_at: new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 'usr_trainer_3',
    full_name: 'Varaprasad',
    role: 'trainer',
    phone: '9765432109',
    email: 'varaprasad@pulsefitness.in',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    gym_name: 'Pulse Fitness - Banashankari',
    branch_id: 'br_bsk_3',
    branch_name: 'Pulse Fitness - Banashankari',
    created_at: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 'usr_trainer_4',
    full_name: 'Gangadhar',
    role: 'trainer',
    phone: '9845112233',
    email: 'gangadhar@pulsefitness.in',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    gym_name: 'Pulse Fitness - Banashankari',
    branch_id: 'br_bsk_3',
    branch_name: 'Pulse Fitness - Banashankari',
    created_at: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 'usr_trainer_5',
    full_name: 'Kumar',
    role: 'trainer',
    phone: '9833445566',
    email: 'kumar@pulsefitness.in',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=200&q=80',
    gym_name: 'Pulse Fitness - RR Nagar',
    branch_id: 'br_rr_2',
    branch_name: 'Pulse Fitness - RR Nagar',
    created_at: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(),
  }
];

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addMonthsToDate(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export interface StaffAttendanceRecord {
  id: string;
  staff_id: string;
  branch_id: string;
  checked_in_at: string;
  checked_out_at?: string | null;
  method: 'qr' | 'manual' | 'owner_override';
  notes?: string | null;
  recorded_by?: string | null;
  created_at: string;
}

// Data Stores
let members: Member[] = [];
let attendanceLogs: AttendanceRecord[] = [];
let staffAttendanceLogs: StaffAttendanceRecord[] = [];
let exportLogs: ExportLogRecord[] = [];
let commissionSettlements: CommissionSettlement[] = [];
let paymentHistory: PaymentRecord[] = [];
let crmActivities: CRMActivity[] = [];
let leads: Lead[] = [];
let automationRules: AutomationRule[] = [...DEFAULT_AUTOMATION_RULES];
let automationLogs: AutomationLog[] = [];
let auditLogs: AuditLog[] = [];
let freezeRequests: MemberFreezeRequest[] = [];
let measurements: MemberMeasurement[] = [];
let announcements: GymAnnouncement[] = [];
let memberRiskScores: MemberRiskScore[] = [];
let retentionAlerts: RetentionAlert[] = [];
let autoDebitAttempts: AutoDebitAttempt[] = [];
let retentionOutreachLogs: RetentionOutreachLog[] = [];
let staffNotifications: StaffNotification[] = [];
let memberChurnPredictions: MemberChurnPrediction[] = [];
let winbackCampaigns: WinbackCampaign[] = [];
let winbackEnrollments: WinbackEnrollment[] = [];
let winbackAttempts: WinbackAttempt[] = [];
let balanceReminderLogs: BalanceReminderLog[] = [];
let balanceReminderSettings: Record<string, BalanceReminderSettings> = {
  'br_nag_1': {
    branch_id: 'br_nag_1',
    min_balance: 1,
    cooldown_days: 3,
    include_expired: false,
    max_digest_rows: 40,
    enabled: true,
    updated_at: new Date().toISOString()
  },
  'br_rr_2': {
    branch_id: 'br_rr_2',
    min_balance: 1,
    cooldown_days: 3,
    include_expired: false,
    max_digest_rows: 40,
    enabled: true,
    updated_at: new Date().toISOString()
  },
  'br_bsk_3': {
    branch_id: 'br_bsk_3',
    min_balance: 1,
    cooldown_days: 3,
    include_expired: false,
    max_digest_rows: 40,
    enabled: true,
    updated_at: new Date().toISOString()
  }
};

interface BranchSmsConfig {
  branch_id: string;
  vault_secret_id: string;
  vault_secret_name: string;
  previous_vault_secret_id?: string | null;
  previous_vault_secret_name?: string | null;
  previous_msg91_last4?: string | null;
  rotation_started_at?: string | null;
  key_created_at?: string;
  key_last_verified_at?: string | null;
  key_last_error?: string | null;
  rotation_due_at?: string | null;
  auto_retire_previous_after?: string | null;
  msg91_sender_id?: string;
  msg91_template_id?: string;
  msg91_last4: string;
  is_configured: boolean;
  updated_at: string;
  updated_by?: string;
}

interface BranchSecretRotationLog {
  id: string;
  branch_id: string;
  action: 'create' | 'rotate' | 'retire_previous' | 'failed';
  actor_id?: string;
  new_last4?: string;
  old_last4?: string;
  error_message?: string;
  created_at: string;
}

interface Msg91DltTemplate {
  id: string;
  branch_id: string | null; // null = org-wide
  name: string;
  purpose: 'expiry_7d' | 'expiry_3d' | 'winback' | 'payment_reminder' | 'stale_nudge' | 'otp' | 'custom';
  msg91_template_id: string;
  sender_id: string | null;
  variable_schema: { key: string; label: string }[];
  sample_body: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

let branchRotationLogs: BranchSecretRotationLog[] = [
  {
    id: 'rot_log_1',
    branch_id: 'br_nag_1',
    action: 'create',
    actor_id: 'usr_super_1',
    new_last4: '8821',
    created_at: new Date(Date.now() - 30 * 86400000).toISOString()
  },
  {
    id: 'rot_log_2',
    branch_id: 'br_bsk_1',
    action: 'create',
    actor_id: 'usr_super_1',
    new_last4: '3942',
    created_at: new Date(Date.now() - 45 * 86400000).toISOString()
  },
  {
    id: 'rot_log_3',
    branch_id: 'br_rrn_1',
    action: 'create',
    actor_id: 'usr_super_1',
    new_last4: '5519',
    created_at: new Date(Date.now() - 20 * 86400000).toISOString()
  }
];

let msg91DltTemplates: Msg91DltTemplate[] = [
  {
    id: 'dlt_tpl_1',
    branch_id: null,
    name: 'Expiry 7-Day Renewal Reminder',
    purpose: 'expiry_7d',
    msg91_template_id: '654a1b2c3d4e5f6g7h8i9j01',
    sender_id: 'PULSEF',
    variable_schema: [
      { key: 'VAR1', label: 'first_name' },
      { key: 'VAR2', label: 'end_date' },
      { key: 'VAR3', label: 'branch_name' }
    ],
    sample_body: 'Hi {#VAR1#}, your Pulse Fitness gym membership expires on {#VAR2#}. Renew now to lock in exclusive regular rates. - {#VAR3#}',
    is_active: true,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 60 * 86400000).toISOString()
  },
  {
    id: 'dlt_tpl_2',
    branch_id: null,
    name: 'Urgent 3-Day Expiry Notice',
    purpose: 'expiry_3d',
    msg91_template_id: '654a1b2c3d4e5f6g7h8i9j02',
    sender_id: 'PULSEF',
    variable_schema: [
      { key: 'VAR1', label: 'first_name' },
      { key: 'VAR2', label: 'end_date' }
    ],
    sample_body: 'Attention {#VAR1#}: Only 3 days left on your gym membership (ends {#VAR2#}). Visit front desk or pay online to prevent access interruption.',
    is_active: true,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 60 * 86400000).toISOString()
  },
  {
    id: 'dlt_tpl_3',
    branch_id: null,
    name: 'Win-Back Exclusive Pass',
    purpose: 'winback',
    msg91_template_id: '654a1b2c3d4e5f6g7h8i9j03',
    sender_id: 'PULSEF',
    variable_schema: [
      { key: 'VAR1', label: 'first_name' },
      { key: 'VAR2', label: 'offer_code' },
      { key: 'VAR3', label: 'discount' }
    ],
    sample_body: 'We miss you at Pulse {#VAR1#}! Enjoy {#VAR3#} off your renewal with code {#VAR2#}. Come back and crush your fitness goals.',
    is_active: true,
    created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 40 * 86400000).toISOString()
  },
  {
    id: 'dlt_tpl_4',
    branch_id: null,
    name: 'Stale Member Check-in Nudge',
    purpose: 'stale_nudge',
    msg91_template_id: '654a1b2c3d4e5f6g7h8i9j04',
    sender_id: 'PULSEF',
    variable_schema: [
      { key: 'VAR1', label: 'first_name' },
      { key: 'VAR2', label: 'days_inactive' }
    ],
    sample_body: 'Hey {#VAR1#}, it has been {#VAR2#} days since your last workout! Your trainer is ready for your next session at Pulse.',
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 30 * 86400000).toISOString()
  },
  {
    id: 'dlt_tpl_5',
    branch_id: null,
    name: 'Outstanding Dues Reminder',
    purpose: 'payment_reminder',
    msg91_template_id: '654a1b2c3d4e5f6g7h8i9j05',
    sender_id: 'PULSEF',
    variable_schema: [
      { key: 'VAR1', label: 'first_name' },
      { key: 'VAR2', label: 'balance_due' }
    ],
    sample_body: 'Hello {#VAR1#}, this is a gentle reminder that your pending balance of Rs. {#VAR2#} is due. Please clear at the counter or via UPI.',
    is_active: true,
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 20 * 86400000).toISOString()
  }
];

let branchSmsConfigs: Record<string, BranchSmsConfig> = {
  'br_nag_1': {
    branch_id: 'br_nag_1',
    vault_secret_id: 'vsec_nag_1',
    vault_secret_name: 'msg91_branch_br_nag_1',
    previous_vault_secret_id: null,
    previous_vault_secret_name: null,
    previous_msg91_last4: null,
    rotation_started_at: null,
    key_created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    key_last_verified_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    key_last_error: null,
    rotation_due_at: new Date(Date.now() + 60 * 86400000).toISOString(),
    auto_retire_previous_after: null,
    msg91_sender_id: 'PULSEF',
    msg91_template_id: '654a1b2c3d4e5f6g7h8i9j01',
    msg91_last4: '8821',
    is_configured: true,
    updated_at: new Date().toISOString(),
    updated_by: 'usr_super_1'
  },
  'br_bsk_1': {
    branch_id: 'br_bsk_1',
    vault_secret_id: 'vsec_bsk_1',
    vault_secret_name: 'msg91_branch_br_bsk_1',
    previous_vault_secret_id: 'vsec_bsk_old',
    previous_vault_secret_name: 'msg91_branch_br_bsk_1_prev',
    previous_msg91_last4: '1094',
    rotation_started_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    key_created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    key_last_verified_at: new Date(Date.now() - 1 * 3600000).toISOString(),
    key_last_error: null,
    rotation_due_at: new Date(Date.now() + 89 * 86400000).toISOString(),
    auto_retire_previous_after: new Date(Date.now() + 6 * 86400000).toISOString(),
    msg91_sender_id: 'PULSEF',
    msg91_template_id: '654a1b2c3d4e5f6g7h8i9j01',
    msg91_last4: '3942',
    is_configured: true,
    updated_at: new Date().toISOString(),
    updated_by: 'usr_super_1'
  },
  'br_rrn_1': {
    branch_id: 'br_rrn_1',
    vault_secret_id: 'vsec_rrn_1',
    vault_secret_name: 'msg91_branch_br_rrn_1',
    previous_vault_secret_id: null,
    previous_vault_secret_name: null,
    previous_msg91_last4: null,
    rotation_started_at: null,
    key_created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    key_last_verified_at: new Date(Date.now() - 5 * 3600000).toISOString(),
    key_last_error: null,
    rotation_due_at: new Date(Date.now() + 70 * 86400000).toISOString(),
    auto_retire_previous_after: null,
    msg91_sender_id: 'PULSEF',
    msg91_template_id: '654a1b2c3d4e5f6g7h8i9j01',
    msg91_last4: '5519',
    is_configured: true,
    updated_at: new Date().toISOString(),
    updated_by: 'usr_super_1'
  }
};

// Automated Churn Prediction Model (Logistic-style Probability from Weighted Factors)
function computeChurnProbability(memberId: string): {
  probability: number;
  band: 'low' | 'medium' | 'high' | 'critical';
  factors: ChurnFactor[];
  branch_id?: string;
} {
  const m = members.find(mem => mem.id === memberId);
  if (!m || m.is_archived || m.status !== 'active') {
    return {
      probability: 0,
      band: 'low',
      factors: [],
      branch_id: m?.branch_id
    };
  }

  const memLogs = attendanceLogs.filter(a => a.member_id === memberId);
  let lastVisit: Date | null = null;
  if (memLogs.length > 0) {
    const sorted = [...memLogs].sort((a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime());
    lastVisit = new Date(sorted[0].checked_in_at);
  }

  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const daysSince = lastVisit
    ? Math.floor((todayDate.getTime() - new Date(lastVisit.getFullYear(), lastVisit.getMonth(), lastVisit.getDate()).getTime()) / (24 * 3600 * 1000))
    : 999;

  let daysLeft = 999;
  if (m.end_date) {
    const endDate = new Date(m.end_date);
    daysLeft = Math.ceil((new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime() - todayDate.getTime()) / (24 * 3600 * 1000));
  }

  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
  const twentyEightDaysAgo = new Date(now.getTime() - 28 * 24 * 3600 * 1000);

  const visits14 = memLogs.filter(a => new Date(a.checked_in_at) >= fourteenDaysAgo).length;
  const visitsPrev14 = memLogs.filter(a => {
    const d = new Date(a.checked_in_at);
    return d >= twentyEightDaysAgo && d < fourteenDaysAgo;
  }).length;

  let logit = -2.2; // base prior ~10%
  const factors: ChurnFactor[] = [];

  // Feature contributions (log-odds style weights)
  if (!lastVisit) {
    logit += 1.40;
    factors.push({ key: 'never_visited', weight: 1.40 });
  } else if (daysSince >= 30) {
    logit += 1.50;
    factors.push({ key: 'stale_30d', weight: 1.50, days: daysSince });
  } else if (daysSince >= 21) {
    logit += 1.10;
    factors.push({ key: 'stale_21d', weight: 1.10, days: daysSince });
  } else if (daysSince >= 14) {
    logit += 0.80;
    factors.push({ key: 'stale_14d', weight: 0.80, days: daysSince });
  }

  if (visitsPrev14 >= 2 && visits14 / visitsPrev14 <= 0.5) {
    logit += 0.90;
    factors.push({ key: 'attendance_drop', weight: 0.90 });
  }

  if (daysLeft <= 0) {
    logit += 1.60;
    factors.push({ key: 'expired', weight: 1.60 });
  } else if (daysLeft <= 3) {
    logit += 1.20;
    factors.push({ key: 'expiring_3d', weight: 1.20, days_left: daysLeft });
  } else if (daysLeft <= 7) {
    logit += 0.85;
    factors.push({ key: 'expiring_7d', weight: 0.85, days_left: daysLeft });
  }

  const bal = Number(m.balance_due) || 0;
  if (bal > 0) {
    let weight = 0.25;
    if (bal >= 3000) weight = 0.70;
    else if (bal >= 1000) weight = 0.45;
    logit += weight;
    factors.push({ key: 'dues', weight, amount: bal });
  }

  // Sigmoid probability calculation: 1 / (1 + e^-logit)
  const prob = 1.0 / (1.0 + Math.exp(-logit));
  const roundedProb = Math.round(prob * 10000) / 10000;

  let band: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (roundedProb >= 0.75) band = 'critical';
  else if (roundedProb >= 0.55) band = 'high';
  else if (roundedProb >= 0.30) band = 'medium';

  return {
    probability: roundedProb,
    band,
    factors,
    branch_id: m.branch_id
  };
}

function refreshChurnPredictions(): { updated: number; at: string } {
  let updatedCount = 0;
  const activeMembers = members.filter(m => m.status === 'active' && !m.is_archived);

  for (const m of activeMembers) {
    const pred = computeChurnProbability(m.id);
    const existingIndex = memberChurnPredictions.findIndex(p => p.member_id === m.id);
    const branch = branches.find(b => b.id === (pred.branch_id || m.branch_id));

    const predObj: MemberChurnPrediction = {
      member_id: m.id,
      branch_id: pred.branch_id || m.branch_id,
      branch_name: branch?.name || m.branch_name,
      member_name: m.full_name,
      member_phone: m.phone,
      member_email: m.email,
      package_type: m.package_type,
      end_date: m.end_date,
      balance_due: m.balance_due,
      churn_probability: pred.probability,
      risk_band: pred.band,
      factors: pred.factors,
      model_version: 'rules_v1',
      predicted_at: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      memberChurnPredictions[existingIndex] = predObj;
    } else {
      memberChurnPredictions.push(predObj);
    }
    updatedCount++;
  }

  return { updated: updatedCount, at: new Date().toISOString() };
}

// Convert on payment trigger: automatic state machine transition
function convertWinbackEnrollmentOnPayment(memberId: string) {
  const eligibleEnrollments = winbackEnrollments.filter(
    e => e.member_id === memberId && (e.status === 'enrolled' || e.status === 'messaged' || e.status === 'failed')
  );

  const nowIso = new Date().toISOString();
  for (const en of eligibleEnrollments) {
    en.status = 'converted';
    en.converted_at = nowIso;
    en.updated_at = nowIso;

    crmActivities.unshift({
      id: `crm_winback_conv_${Date.now()}_${en.id}`,
      member_id: memberId,
      branch_id: en.branch_id || 'br_nag_1',
      type: 'payment',
      title: '🎯 Win-Back Campaign Conversion',
      description: `Member converted following automated win-back outreach campaign. Status updated to 'converted'.`,
      actor_name: 'Winback Automation Engine',
      created_at: nowIso
    });
  }
}

// Indian Standard Time (IST UTC+5:30) Silence Hours Check: 21:00 - 08:00
function inSilenceHoursIST(): boolean {
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istTime = new Date(utcMs + (3600000 * 5.5));
  const istHour = istTime.getHours();
  return istHour >= 21 || istHour < 8;
}

function phone10(p: string | null | undefined): string | null {
  const d = String(p || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? d : null;
}

// AI Retention Risk Scoring Calculation Engine
function calculateMemberRisk(
  member: Member,
  allAttendance: AttendanceRecord[]
): { score: number; level: 'low' | 'medium' | 'high'; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Filter member attendances
  const memberVisits = allAttendance
    .filter((a) => a.member_id === member.id)
    .sort((a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime());

  const lastVisit = memberVisits.length > 0 ? new Date(memberVisits[0].checked_in_at) : null;
  const now = new Date();

  // Factor 1: Days since last visit
  if (lastVisit) {
    const daysSince = Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 3600 * 24));
    if (daysSince >= 21) {
      score += 35;
      reasons.push(`No gym check-in for ${daysSince} consecutive days`);
    } else if (daysSince >= 14) {
      score += 25;
      reasons.push(`No gym check-in for ${daysSince} days`);
    } else if (daysSince >= 7) {
      score += 10;
      reasons.push(`Absent for ${daysSince} days`);
    }
  } else if (member.status === 'active') {
    score += 30;
    reasons.push('No recorded check-ins since membership activation');
  }

  // Factor 2: Days until membership expiry
  if (member.end_date) {
    const endDate = new Date(member.end_date);
    const daysToExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
    if (daysToExpiry < 0) {
      score += 35;
      reasons.push(`Membership expired ${Math.abs(daysToExpiry)} days ago`);
    } else if (daysToExpiry <= 5) {
      score += 25;
      reasons.push(`Membership ends in ${daysToExpiry} days`);
    } else if (daysToExpiry <= 10) {
      score += 15;
      reasons.push(`Membership renewal due in ${daysToExpiry} days`);
    }
  }

  // Factor 3: Outstanding balance due
  if (member.balance_due && member.balance_due > 0) {
    score += 15;
    reasons.push(`Outstanding balance of ₹${member.balance_due.toLocaleString('en-IN')}`);
  }

  // Factor 4: Failed Auto-Debit e-mandate
  if (member.mandate_status === 'failed') {
    score += 20;
    reasons.push('UPI Auto-Debit e-mandate transaction failed');
  }

  const finalScore = Math.min(100, Math.max(0, score));
  const level: 'low' | 'medium' | 'high' =
    finalScore >= 70 ? 'high' : finalScore >= 40 ? 'medium' : 'low';

  return { score: finalScore, level, reasons };
}

function initializeSeedData() {
  const today = getTodayStr();
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const lastMonth = new Date(Date.now() - 32 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  members = [
    {
      id: 'mem_1',
      full_name: 'Aarav Mehta',
      phone: '9820112233',
      age: 26,
      gender: 'Male',
      email: 'aarav.m@gmail.com',
      emergency_contact: '9820112200 (Father)',
      notes: 'Wants weight gain and muscle building',
      status: 'pending',
      lifecycle_stage: 'lead',
      onboarded_by: 'usr_trainer_1',
      trainer_name: 'Vishal',
      branch_id: 'br_nag_1',
      branch_name: 'Pulse Fitness - Nagarbhavi',
      is_archived: false,
      created_at: `${today}T10:15:00.000Z`,
      updated_at: `${today}T10:15:00.000Z`
    },
    {
      id: 'mem_2',
      full_name: 'Rhea Sen',
      phone: '9876001122',
      age: 24,
      gender: 'Female',
      email: 'rhea.sen@yahoo.com',
      emergency_contact: '9876001100',
      notes: 'Interested in Cardio & HIIT package',
      status: 'pending',
      lifecycle_stage: 'walk_in',
      onboarded_by: 'usr_trainer_2',
      trainer_name: 'Manju',
      branch_id: 'br_nag_1',
      branch_name: 'Pulse Fitness - Nagarbhavi',
      is_archived: false,
      created_at: `${today}T11:30:00.000Z`,
      updated_at: `${today}T11:30:00.000Z`
    },
    {
      id: 'mem_3',
      full_name: 'Siddharth Rao',
      phone: '9988776655',
      age: 29,
      gender: 'Male',
      email: 'sid.rao@outlook.com',
      notes: 'Morning slot regular',
      status: 'active',
      lifecycle_stage: 'active',
      subscription_months: 6,
      package_type: 'General Gym',
      payment_method: 'UPI / GPay / PhonePe',
      amount_paid: 12000,
      balance_due: 0,
      payment_reference: 'UPI/9812938192/GPay',
      commission_rate: 10,
      commission_amount: 1200,
      start_date: today,
      end_date: addMonthsToDate(today, 6),
      onboarded_by: 'usr_trainer_1',
      trainer_name: 'Vishal',
      branch_id: 'br_nag_1',
      branch_name: 'Pulse Fitness - Nagarbhavi',
      auto_debit_enabled: true,
      mandate_status: 'active',
      next_billing_date: addMonthsToDate(today, 6),
      is_archived: false,
      created_at: `${today}T08:00:00.000Z`,
      updated_at: `${today}T08:05:00.000Z`
    },
    {
      id: 'mem_4',
      full_name: 'Ananya Deshmukh',
      phone: '9811223344',
      age: 22,
      gender: 'Female',
      email: 'ananya.d@gmail.com',
      status: 'active',
      lifecycle_stage: 'active',
      subscription_months: 3,
      package_type: 'Personal Training (PT)',
      payment_method: 'UPI / GPay / PhonePe',
      amount_paid: 12000,
      balance_due: 3000,
      payment_reference: 'UPI/7712398213/PhonePe',
      commission_rate: 20,
      commission_amount: 2400,
      start_date: today,
      end_date: addMonthsToDate(today, 3),
      onboarded_by: 'usr_trainer_2',
      trainer_name: 'Manju',
      branch_id: 'br_nag_1',
      branch_name: 'Pulse Fitness - Nagarbhavi',
      is_archived: false,
      created_at: `${today}T09:20:00.000Z`,
      updated_at: `${today}T09:25:00.000Z`
    },
    {
      id: 'mem_5',
      full_name: 'Karan Kapoor',
      phone: '9711556677',
      age: 31,
      gender: 'Male',
      status: 'active',
      lifecycle_stage: 'active',
      subscription_months: 12,
      package_type: 'VIP Annual Membership',
      payment_method: 'Card',
      amount_paid: 24000,
      balance_due: 0,
      payment_reference: 'POS_TXN_99812',
      commission_rate: 15,
      commission_amount: 3600,
      start_date: yesterday,
      end_date: addMonthsToDate(yesterday, 12),
      onboarded_by: 'usr_trainer_5',
      trainer_name: 'Kumar',
      branch_id: 'br_rr_2',
      branch_name: 'Pulse Fitness - RR Nagar',
      is_archived: false,
      created_at: `${yesterday}T14:10:00.000Z`,
      updated_at: `${yesterday}T14:15:00.000Z`
    },
    {
      id: 'mem_6',
      full_name: 'Neha Nair',
      phone: '9654321098',
      age: 27,
      gender: 'Female',
      status: 'active',
      lifecycle_stage: 'renewal_due',
      subscription_months: 1,
      package_type: 'General Gym',
      payment_method: 'Cash',
      amount_paid: 2000,
      balance_due: 0,
      commission_rate: 10,
      commission_amount: 200,
      start_date: sixDaysAgo,
      end_date: new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      onboarded_by: 'usr_trainer_1',
      trainer_name: 'Vishal',
      branch_id: 'br_nag_1',
      branch_name: 'Pulse Fitness - Nagarbhavi',
      is_archived: false,
      created_at: `${sixDaysAgo}T17:45:00.000Z`,
      updated_at: `${sixDaysAgo}T17:50:00.000Z`
    },
    {
      id: 'mem_7',
      full_name: 'Vikram Joshi',
      phone: '9844332211',
      age: 35,
      gender: 'Male',
      status: 'expired',
      lifecycle_stage: 'expired',
      subscription_months: 1,
      package_type: 'General Gym',
      payment_method: 'Cash',
      amount_paid: 2000,
      balance_due: 0,
      commission_rate: 10,
      commission_amount: 200,
      start_date: lastMonth,
      end_date: yesterday,
      onboarded_by: 'usr_trainer_3',
      trainer_name: 'Varaprasad',
      branch_id: 'br_bsk_3',
      branch_name: 'Pulse Fitness - Banashankari',
      is_archived: false,
      created_at: `${lastMonth}T10:00:00.000Z`,
      updated_at: `${lastMonth}T10:05:00.000Z`
    },
    {
      id: 'mem_8',
      full_name: 'Manish Pandey',
      phone: '9900112233',
      age: 33,
      gender: 'Male',
      status: 'active',
      lifecycle_stage: 'active',
      subscription_months: 1,
      package_type: 'Cardio & HIIT Special',
      payment_method: 'UPI / GPay / PhonePe',
      amount_paid: 3500,
      balance_due: 0,
      commission_rate: 15,
      commission_amount: 525,
      start_date: threeDaysAgo,
      end_date: new Date(Date.now() + 12 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      onboarded_by: 'usr_trainer_4',
      trainer_name: 'Gangadhar',
      branch_id: 'br_bsk_3',
      branch_name: 'Pulse Fitness - Banashankari',
      is_archived: false,
      created_at: `${threeDaysAgo}T09:00:00.000Z`,
      updated_at: `${threeDaysAgo}T09:05:00.000Z`
    }
  ];

  leads = [
    {
      id: 'lead_1',
      full_name: 'Rajesh Kulkarni',
      phone: '9823456789',
      email: 'rajesh.k@gmail.com',
      source: 'Instagram',
      status: 'Hot',
      interested_plan: 'Personal Training (PT)',
      budget: 15000,
      follow_up_date: today,
      notes: 'Wants morning 7 AM PT slot with senior trainer',
      assigned_trainer_id: 'usr_trainer_1',
      assigned_trainer_name: 'Vishal',
      branch_id: 'br_nag_1',
      branch_name: 'Pulse Fitness - Nagarbhavi',
      created_at: `${yesterday}T12:00:00.000Z`
    },
    {
      id: 'lead_2',
      full_name: 'Deepika Padukone',
      phone: '9819988776',
      email: 'deepika.p@gmail.com',
      source: 'Walk-in',
      status: 'Warm',
      interested_plan: 'VIP Annual Membership',
      budget: 25000,
      follow_up_date: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      notes: 'Visited gym yesterday. Impressed with Banashankari facility.',
      assigned_trainer_id: 'usr_trainer_3',
      assigned_trainer_name: 'Varaprasad',
      branch_id: 'br_bsk_3',
      branch_name: 'Pulse Fitness - Banashankari',
      created_at: `${threeDaysAgo}T15:30:00.000Z`
    },
    {
      id: 'lead_3',
      full_name: 'Amitabh Roy',
      phone: '9769001122',
      email: 'amitabh.roy@yahoo.in',
      source: 'Google',
      status: 'Cold',
      interested_plan: 'General Gym',
      budget: 10000,
      follow_up_date: yesterday,
      notes: 'Inquired about corporate discount for 5 colleagues at RR Nagar',
      assigned_trainer_id: 'usr_trainer_5',
      assigned_trainer_name: 'Kumar',
      branch_id: 'br_rr_2',
      branch_name: 'Pulse Fitness - RR Nagar',
      created_at: `${sixDaysAgo}T11:00:00.000Z`
    }
  ];

  crmActivities = [
    {
      id: 'crm_1',
      member_id: 'mem_3',
      branch_id: 'br_nag_1',
      type: 'joined',
      title: 'Joined Pulse Fitness',
      description: 'Enrolled in 6-Month General Gym membership via GPay.',
      actor_name: 'Vishal (Trainer)',
      created_at: `${today}T08:05:00.000Z`
    },
    {
      id: 'crm_2',
      member_id: 'mem_4',
      branch_id: 'br_nag_1',
      type: 'payment',
      title: 'Payment Received (₹12,000)',
      description: 'Partial activation payment. Remaining balance due: ₹3,000.',
      actor_name: 'Manju (Trainer)',
      created_at: `${today}T09:25:00.000Z`
    },
    {
      id: 'crm_3',
      member_id: 'mem_3',
      branch_id: 'br_nag_1',
      type: 'attendance',
      title: 'QR Check-in',
      description: 'Checked in at Nagarbhavi branch turnstile via Mobile QR Code.',
      actor_name: 'Vishal',
      created_at: `${today}T06:30:00.000Z`
    }
  ];

  announcements = [
    {
      id: 'ann_1',
      branch_id: 'br_nag_1',
      title: '🏋️‍♂️ Special Sunday Powerlifting Workshop',
      content: 'Join Coach Vishal and Coach Manju this Sunday at 10 AM for a squat and deadlift form breakdown session! Free for all active members.',
      author_name: 'Bipin Amrutha (Super Owner)',
      category: 'event',
      created_at: `${today}T09:00:00.000Z`
    },
    {
      id: 'ann_2',
      title: '🎉 Annual Festival Pass Discount!',
      content: 'Upgrade to VIP Annual Membership this week and get 2 extra months FREE + Complimentary Diet Plan.',
      author_name: 'Bipin Amrutha (Super Owner)',
      category: 'offer',
      created_at: `${yesterday}T10:00:00.000Z`
    }
  ];

  measurements = [
    {
      id: 'meas_1',
      member_id: 'mem_3',
      date: today,
      weight_kg: 78.5,
      body_fat_pct: 18.2,
      waist_inches: 33.0,
      chest_inches: 40.5,
      biceps_inches: 14.5,
      notes: 'Initial body composition check on joining',
      created_at: `${today}T08:10:00.000Z`
    }
  ];

  freezeRequests = [
    {
      id: 'frz_1',
      member_id: 'mem_5',
      member_name: 'Karan Kapoor',
      start_date: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      reason: 'Official business travel to London',
      status: 'pending',
      branch_id: 'br_rr_2',
      created_at: `${today}T12:00:00.000Z`
    }
  ];

  auditLogs = [
    {
      id: 'aud_1',
      user_id: 'usr_owner_1',
      user_name: 'Bipin Amrutha',
      user_role: 'super_owner',
      action: 'MEMBER_ACTIVATED',
      entity_type: 'member',
      entity_id: 'mem_3',
      new_value: { name: 'Siddharth Rao', plan: 'General Gym', price: 12000 },
      branch_id: 'br_nag_1',
      device_info: 'Web Dashboard / Chrome',
      created_at: `${today}T08:05:00.000Z`
    }
  ];

  // Seed 14 days of realistic gym attendance check-ins across morning & evening peak slots
  attendanceLogs = [
    {
      id: 'att_today_1',
      member_id: 'mem_3',
      member_name: 'Siddharth Rao',
      member_package: 'General Gym',
      checked_in_at: `${today}T06:30:00.000Z`,
      checked_in_by: 'usr_trainer_1',
      checked_in_by_name: 'Vishal',
      method: 'qr',
      notes: 'Morning cardio & weights'
    },
    {
      id: 'att_today_2',
      member_id: 'mem_4',
      member_name: 'Ananya Deshmukh',
      member_package: 'Personal Training (PT)',
      checked_in_at: `${today}T07:15:00.000Z`,
      checked_in_by: 'usr_trainer_2',
      checked_in_by_name: 'Manju',
      method: 'qr',
      notes: 'PT Session: Legs & Core'
    },
    {
      id: 'att_today_3',
      member_id: 'mem_5',
      member_name: 'Karan Kapoor',
      member_package: 'VIP Annual Membership',
      checked_in_at: `${today}T08:05:00.000Z`,
      checked_in_by: 'usr_trainer_5',
      checked_in_by_name: 'Kumar',
      method: 'manual',
      notes: 'VIP early session'
    },
    {
      id: 'att_today_4',
      member_id: 'mem_8',
      member_name: 'Manish Pandey',
      member_package: 'Cardio & HIIT Special',
      checked_in_at: `${today}T09:00:00.000Z`,
      checked_in_by: 'usr_trainer_4',
      checked_in_by_name: 'Gangadhar',
      method: 'qr',
      notes: 'HIIT batch'
    },
    {
      id: 'att_today_5',
      member_id: 'mem_6',
      member_name: 'Neha Nair',
      member_package: 'General Gym',
      checked_in_at: `${today}T18:15:00.000Z`,
      checked_in_by: 'usr_trainer_1',
      checked_in_by_name: 'Vishal',
      method: 'qr',
      notes: 'Evening strength session'
    },
    {
      id: 'att_yest_1',
      member_id: 'mem_3',
      member_name: 'Siddharth Rao',
      member_package: 'General Gym',
      checked_in_at: `${yesterday}T06:45:00.000Z`,
      checked_in_by: 'usr_trainer_1',
      checked_in_by_name: 'Vishal',
      method: 'qr',
      notes: 'Chest & Triceps'
    },
    {
      id: 'att_yest_2',
      member_id: 'mem_5',
      member_name: 'Karan Kapoor',
      member_package: 'VIP Annual Membership',
      checked_in_at: `${yesterday}T07:30:00.000Z`,
      checked_in_by: 'usr_trainer_5',
      checked_in_by_name: 'Kumar',
      method: 'qr',
      notes: 'Back & Biceps'
    },
    {
      id: 'att_yest_3',
      member_id: 'mem_6',
      member_name: 'Neha Nair',
      member_package: 'General Gym',
      checked_in_at: `${yesterday}T18:40:00.000Z`,
      checked_in_by: 'usr_trainer_1',
      checked_in_by_name: 'Vishal',
      method: 'qr',
      notes: 'Cardio endurance'
    },
    {
      id: 'att_yest_4',
      member_id: 'mem_8',
      member_name: 'Manish Pandey',
      member_package: 'Cardio & HIIT Special',
      checked_in_at: `${yesterday}T19:15:00.000Z`,
      checked_in_by: 'usr_trainer_3',
      checked_in_by_name: 'Varaprasad',
      method: 'qr',
      notes: 'HIIT group'
    }
  ];

  // Dynamically add history check-ins for days 2 to 14
  const memberPool = [
    { id: 'mem_3', name: 'Siddharth Rao', pkg: 'General Gym', trainer: 'usr_trainer_1', trainerName: 'Vishal' },
    { id: 'mem_4', name: 'Ananya Deshmukh', pkg: 'Personal Training (PT)', trainer: 'usr_trainer_2', trainerName: 'Manju' },
    { id: 'mem_5', name: 'Karan Kapoor', pkg: 'VIP Annual Membership', trainer: 'usr_trainer_5', trainerName: 'Kumar' },
    { id: 'mem_6', name: 'Neha Nair', pkg: 'General Gym', trainer: 'usr_trainer_1', trainerName: 'Vishal' },
    { id: 'mem_8', name: 'Manish Pandey', pkg: 'Cardio & HIIT Special', trainer: 'usr_trainer_3', trainerName: 'Varaprasad' }
  ];

  for (let d = 2; d <= 14; d++) {
    const pastDate = new Date(Date.now() - d * 24 * 3600 * 1000).toISOString().slice(0, 10);
    // Morning peak check-ins (6am - 9am)
    attendanceLogs.push({
      id: `att_past_${d}_1`,
      member_id: memberPool[d % memberPool.length].id,
      member_name: memberPool[d % memberPool.length].name,
      member_package: memberPool[d % memberPool.length].pkg,
      checked_in_at: `${pastDate}T0${6 + (d % 3)}:${10 * (d % 5)}:00.000Z`,
      checked_in_by: memberPool[d % memberPool.length].trainer,
      checked_in_by_name: memberPool[d % memberPool.length].trainerName,
      method: 'qr',
      notes: 'Morning session'
    });

    if (d % 2 === 0) {
      attendanceLogs.push({
        id: `att_past_${d}_2`,
        member_id: memberPool[(d + 1) % memberPool.length].id,
        member_name: memberPool[(d + 1) % memberPool.length].name,
        member_package: memberPool[(d + 1) % memberPool.length].pkg,
        checked_in_at: `${pastDate}T07:45:00.000Z`,
        checked_in_by: 'usr_trainer_2',
        checked_in_by_name: 'Manju',
        method: 'qr',
        notes: 'Cardio'
      });
    }

    // Evening peak check-ins (5pm - 8pm)
    attendanceLogs.push({
      id: `att_past_${d}_3`,
      member_id: memberPool[(d + 2) % memberPool.length].id,
      member_name: memberPool[(d + 2) % memberPool.length].name,
      member_package: memberPool[(d + 2) % memberPool.length].pkg,
      checked_in_at: `${pastDate}T1${7 + (d % 3)}:20:00.000Z`,
      checked_in_by: 'usr_trainer_1',
      checked_in_by_name: 'Vishal',
      method: 'qr',
      notes: 'Evening peak workout'
    });
  }

  // Seed Staff Attendance for trainers across branches
  staffAttendanceLogs = [
    {
      id: 'stf_att_today_1',
      staff_id: 'usr_trainer_1', // Vishal - Nagarabhavi
      branch_id: 'br_nag_1',
      checked_in_at: `${today}T06:30:00.000Z`,
      checked_out_at: null, // Currently open shift (on floor)
      method: 'qr',
      notes: 'Morning shift opening check-in',
      recorded_by: 'usr_trainer_1',
      created_at: `${today}T06:30:00.000Z`
    },
    {
      id: 'stf_att_today_2',
      staff_id: 'usr_trainer_2', // Manju - Nagarabhavi
      branch_id: 'br_nag_1',
      checked_in_at: `${today}T06:00:00.000Z`,
      checked_out_at: `${today}T11:00:00.000Z`,
      method: 'manual',
      notes: 'Morning batch trainer completed',
      recorded_by: 'usr_owner_1',
      created_at: `${today}T06:00:00.000Z`
    },
    {
      id: 'stf_att_today_3',
      staff_id: 'usr_trainer_3', // Pradeep - RR Nagar
      branch_id: 'br_rr_2',
      checked_in_at: `${today}T07:00:00.000Z`,
      checked_out_at: null, // On floor
      method: 'qr',
      notes: 'Floor duty & PT slots',
      recorded_by: 'usr_trainer_3',
      created_at: `${today}T07:00:00.000Z`
    },
    {
      id: 'stf_att_today_4',
      staff_id: 'usr_trainer_4', // Ananya - Banashankari
      branch_id: 'br_bsk_3',
      checked_in_at: `${today}T06:45:00.000Z`,
      checked_out_at: null, // On floor
      method: 'qr',
      notes: 'Zumba & General fitness shift',
      recorded_by: 'usr_trainer_4',
      created_at: `${today}T06:45:00.000Z`
    },
    {
      id: 'stf_att_yesterday_1',
      staff_id: 'usr_trainer_1',
      branch_id: 'br_nag_1',
      checked_in_at: `${yesterday}T06:30:00.000Z`,
      checked_out_at: `${yesterday}T14:30:00.000Z`,
      method: 'qr',
      notes: 'Full day shift',
      recorded_by: 'usr_trainer_1',
      created_at: `${yesterday}T06:30:00.000Z`
    },
    {
      id: 'stf_att_yesterday_2',
      staff_id: 'usr_trainer_2',
      branch_id: 'br_nag_1',
      checked_in_at: `${yesterday}T16:00:00.000Z`,
      checked_out_at: `${yesterday}T21:30:00.000Z`,
      method: 'manual',
      notes: 'Evening shift',
      recorded_by: 'usr_owner_1',
      created_at: `${yesterday}T16:00:00.000Z`
    }
  ];

  exportLogs = [
    {
      id: 'exp_1',
      exported_by: 'usr_owner_1',
      exported_by_name: 'Bipin Amrutha',
      export_type: 'vcf',
      filter_used: 'Active Members',
      member_count: 5,
      created_at: `${yesterday}T16:00:00.000Z`
    }
  ];

  const currentMonthStr = `${today.slice(0, 7)}-01`;
  commissionSettlements = [
    {
      id: 'set_1',
      trainer_id: 'usr_trainer_1',
      trainer_name: 'Vishal',
      member_id: 'mem_3',
      member_name: 'Vikram Malhotra',
      member_phone: '9876543210',
      branch_id: 'br_nag_1',
      branch_name: 'Pulse Fitness - Nagarbhavi',
      payment_id: 'pay_1',
      amount: 1200,
      rate_percent: 10,
      base_amount: 12000,
      package_type: 'General Gym',
      period_start: lastMonth,
      period_end: today,
      period_month: currentMonthStr,
      status: 'paid',
      paid_at: `${yesterday}T18:00:00.000Z`,
      paid_by: 'usr_owner_1',
      notes: 'Initial 6-month membership commission paid via UPI',
      created_at: `${yesterday}T18:00:00.000Z`
    },
    {
      id: 'set_2',
      trainer_id: 'usr_trainer_2',
      trainer_name: 'Manju',
      member_id: 'mem_4',
      member_name: 'Ananya Sharma',
      member_phone: '9811223344',
      branch_id: 'br_nag_1',
      branch_name: 'Pulse Fitness - Nagarbhavi',
      payment_id: 'pay_2',
      amount: 1200,
      rate_percent: 10,
      base_amount: 12000,
      package_type: 'Personal Training',
      period_start: currentMonthStr,
      period_end: today,
      period_month: currentMonthStr,
      status: 'pending',
      notes: 'Partial activation payment commission',
      created_at: `${today}T09:25:00.000Z`
    },
    {
      id: 'set_3',
      trainer_id: 'usr_trainer_3',
      trainer_name: 'Varaprasad',
      member_id: 'mem_5',
      member_name: 'Rajesh Gupta',
      member_phone: '9844556677',
      branch_id: 'br_bsk_3',
      branch_name: 'Pulse Fitness - Banashankari',
      payment_id: 'pay_3',
      amount: 800,
      rate_percent: 10,
      base_amount: 8000,
      package_type: 'CrossFit / HIIT',
      period_start: currentMonthStr,
      period_end: today,
      period_month: currentMonthStr,
      status: 'pending',
      notes: 'New quarter membership commission',
      created_at: `${today}T10:15:00.000Z`
    },
    {
      id: 'set_4',
      trainer_id: 'usr_trainer_4',
      trainer_name: 'Gangadhar',
      member_id: 'mem_8',
      member_name: 'Manish Pandey',
      member_phone: '9900112233',
      branch_id: 'br_bsk_3',
      branch_name: 'Pulse Fitness - Banashankari',
      payment_id: 'pay_4',
      amount: 525,
      rate_percent: 15,
      base_amount: 3500,
      package_type: 'Cardio & HIIT Special',
      period_start: currentMonthStr,
      period_end: today,
      period_month: currentMonthStr,
      status: 'pending',
      notes: 'Monthly HIIT coaching commission',
      created_at: `${today}T11:00:00.000Z`
    },
    {
      id: 'set_5',
      trainer_id: 'usr_trainer_5',
      trainer_name: 'Kumar',
      member_id: 'mem_5',
      member_name: 'Karan Kapoor',
      member_phone: '9711556677',
      branch_id: 'br_rr_2',
      branch_name: 'Pulse Fitness - RR Nagar',
      payment_id: 'pay_5',
      amount: 3600,
      rate_percent: 15,
      base_amount: 24000,
      package_type: 'VIP Annual Membership',
      period_start: currentMonthStr,
      period_end: today,
      period_month: currentMonthStr,
      status: 'pending',
      notes: 'VIP Annual onboarding commission',
      created_at: `${yesterday}T14:15:00.000Z`
    }
  ];

  paymentHistory = [
    {
      id: 'pay_1',
      member_id: 'mem_3',
      amount: 12000,
      payment_method: 'UPI / GPay / PhonePe',
      payment_reference: 'UPI/9812938192/GPay',
      notes: 'Initial 6-month general gym membership',
      received_by: 'usr_trainer_1',
      received_by_name: 'Rahul Sharma',
      created_at: `${today}T08:05:00.000Z`
    },
    {
      id: 'pay_2',
      member_id: 'mem_4',
      amount: 12000,
      payment_method: 'UPI / GPay / PhonePe',
      payment_reference: 'UPI/7712398213/PhonePe',
      notes: 'Partial activation payment (₹3,000 balance pending)',
      received_by: 'usr_trainer_2',
      received_by_name: 'Priya Patel',
      created_at: `${today}T09:25:00.000Z`
    }
  ];

  // Seed Retention & Risk Engine
  memberRiskScores = [
    {
      id: 'rsk_1',
      member_id: 'mem_6',
      branch_id: 'br_nag_1',
      risk_score: 75,
      risk_level: 'high',
      reasons: ['Membership renewal due in 4 days', 'No gym check-in for 6 days'],
      calculated_at: `${today}T06:00:00.000Z`
    },
    {
      id: 'mem_4_risk',
      member_id: 'mem_4',
      branch_id: 'br_nag_1',
      risk_score: 45,
      risk_level: 'medium',
      reasons: ['Outstanding balance of ₹3,000'],
      calculated_at: `${today}T06:00:00.000Z`
    },
    {
      id: 'mem_3_risk',
      member_id: 'mem_3',
      branch_id: 'br_nag_1',
      risk_score: 10,
      risk_level: 'low',
      reasons: ['Consistent regular check-ins', 'E-Mandate AutoPay active'],
      calculated_at: `${today}T06:00:00.000Z`
    }
  ];

  retentionAlerts = [
    {
      id: 'alt_1',
      member_id: 'mem_6',
      branch_id: 'br_nag_1',
      alert_type: 'at_risk',
      severity: 'high',
      message: 'Membership renewal due in 4 days · Absent for 6 days',
      is_resolved: false,
      created_at: `${today}T06:00:00.000Z`
    }
  ];

  autoDebitAttempts = [
    {
      id: 'adb_1',
      member_id: 'mem_3',
      branch_id: 'br_nag_1',
      amount: 12000,
      status: 'success',
      razorpay_payment_id: 'pay_rzp_mock_9921',
      attempted_at: `${today}T08:05:00.000Z`
    }
  ];

  retentionOutreachLogs = [
    {
      id: 'out_1',
      member_id: 'mem_6',
      branch_id: 'br_nag_1',
      alert_id: 'alt_1',
      channel: 'whatsapp',
      status: 'sent',
      message_body: 'Hi Neha, your Pulse Fitness membership ends in 4 days! Renew today to retain your current discounted rate.',
      provider_response: { provider: 'WHATSAPP_CLOUD_API', status: 'DELIVERED' },
      reply_received: true,
      reply_text: 'Hi Rahul! Yes I will renew this Friday after my shift.',
      replied_at: `${today}T11:00:00.000Z`,
      sent_at: `${yesterday}T10:00:00.000Z`
    }
  ];

  staffNotifications = [
    {
      id: 'notif_1',
      user_id: 'usr_trainer_1',
      branch_id: 'br_nag_1',
      type: 'member_reply',
      title: '💬 Member Reply: Neha Nair',
      body: '"Hi Rahul! Yes I will renew this Friday after my shift."',
      member_id: 'mem_6',
      is_read: false,
      created_at: `${today}T11:00:00.000Z`
    },
    {
      id: 'notif_2',
      user_id: 'usr_trainer_1',
      branch_id: 'br_nag_1',
      type: 'high_risk',
      title: '⚠️ At-Risk Member Alert: Neha Nair',
      body: 'Score 75/100: Renewal due in 4 days & no attendance for 6 days.',
      member_id: 'mem_6',
      is_read: false,
      created_at: `${today}T06:00:00.000Z`
    }
  ];

  winbackCampaigns = [
    {
      id: 'cmp_default_winback',
      name: 'Default win-back high risk',
      min_probability: 0.55,
      channels: ['whatsapp', 'sms', 'email'],
      max_attempts: 3,
      cooldown_hours: 48,
      is_active: true,
      created_at: `${lastMonth}T00:00:00.000Z`
    }
  ];

  // Populate initial ML churn predictions for all members
  refreshChurnPredictions();

  // Seed sample winback enrollments and attempts
  winbackEnrollments = [
    {
      id: 'enr_1',
      campaign_id: 'cmp_default_winback',
      campaign_name: 'Default win-back high risk',
      member_id: 'mem_6',
      branch_id: 'br_nag_1',
      branch_name: 'Pulse Fitness - Nagarbhavi',
      status: 'messaged',
      attempt_count: 1,
      last_channel: 'whatsapp',
      last_attempt_at: `${yesterday}T10:00:00.000Z`,
      churn_probability: 0.8125,
      created_at: `${yesterday}T09:00:00.000Z`,
      updated_at: `${yesterday}T10:00:00.000Z`
    },
    {
      id: 'enr_2',
      campaign_id: 'cmp_default_winback',
      campaign_name: 'Default win-back high risk',
      member_id: 'mem_4',
      branch_id: 'br_nag_1',
      branch_name: 'Pulse Fitness - Nagarbhavi',
      status: 'enrolled',
      attempt_count: 0,
      churn_probability: 0.6134,
      created_at: `${today}T06:00:00.000Z`,
      updated_at: `${today}T06:00:00.000Z`
    }
  ];

  winbackAttempts = [
    {
      id: 'att_1',
      enrollment_id: 'enr_1',
      member_id: 'mem_6',
      member_name: 'Neha Nair',
      member_phone: '9833445566',
      channel: 'whatsapp',
      status: 'sent',
      provider_id: 'msg_wac_991283',
      created_at: `${yesterday}T10:00:00.000Z`
    }
  ];
}

initializeSeedData();

/**
 * Dynamic Expiry Auto-Sync Helper
 */
function syncMemberExpiries() {
  const todayStr = getTodayStr();
  members.forEach(m => {
    if (!m.is_archived && m.status === 'active' && m.end_date) {
      if (m.end_date < todayStr) {
        m.status = 'expired';
        m.updated_at = new Date().toISOString();
      }
    }
  });
}

// API ROUTES

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', gym: 'Pulse Fitness', timestamp: new Date().toISOString() });
});

// Profiles
app.get('/api/profiles', (req, res) => {
  res.json(profiles);
});

// Trainers List with joined Branch info
app.get('/api/trainers', (req, res) => {
  const { branch_id } = req.query;
  let list = profiles.filter(p => p.role === 'trainer');
  if (branch_id && branch_id !== 'all') {
    list = list.filter(p => p.branch_id === branch_id);
  }
  const enriched = list.map(t => {
    const br = branches.find(b => b.id === t.branch_id);
    return {
      ...t,
      branch_name: br ? br.name : t.branch_name || 'Pulse Fitness - Nagarabhavi',
      branch: br ? { id: br.id, name: br.name, code: br.code, city: br.city } : undefined
    };
  });
  res.json(enriched);
});

// Members List with Intelligence & Archive Filters
app.get('/api/members', (req, res) => {
  syncMemberExpiries();
  const { filter, trainerId, search, status, includeArchived } = req.query;
  let result = [...members];

  // Filter archived members by default unless explicitly requesting archived filter or includeArchived=true
  if (filter === 'archived') {
    result = result.filter(m => m.is_archived === true);
  } else if (includeArchived !== 'true') {
    result = result.filter(m => !m.is_archived);
  }

  if (status && typeof status === 'string') {
    result = result.filter(m => m.status === status);
  }

  if (trainerId && typeof trainerId === 'string') {
    result = result.filter(m => m.onboarded_by === trainerId);
  }

  const today = getTodayStr();

  if (filter === 'today') {
    result = result.filter(m => m.start_date === today || m.created_at.startsWith(today));
  } else if (filter === 'this_week') {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    result = result.filter(m => (m.start_date && m.start_date >= sevenDaysAgo) || m.created_at >= sevenDaysAgo);
  } else if (filter === 'pending') {
    result = result.filter(m => m.status === 'pending');
  } else if (filter === 'active') {
    result = result.filter(m => m.status === 'active');
  } else if (filter === 'expired') {
    result = result.filter(m => m.status === 'expired');
  } else if (filter === 'expiring_7') {
    const sevenDaysLater = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    result = result.filter(m => m.status === 'active' && m.end_date && m.end_date >= today && m.end_date <= sevenDaysLater);
  } else if (filter === 'expiring_15') {
    const fifteenDaysLater = new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    result = result.filter(m => m.status === 'active' && m.end_date && m.end_date >= today && m.end_date <= fifteenDaysLater);
  } else if (filter === 'expiring_30') {
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    result = result.filter(m => m.status === 'active' && m.end_date && m.end_date >= today && m.end_date <= thirtyDaysLater);
  }

  if (search && typeof search === 'string') {
    const q = search.toLowerCase().trim();
    result = result.filter(m =>
      m.full_name.toLowerCase().includes(q) ||
      m.phone.includes(q) ||
      (m.email && m.email.toLowerCase().includes(q)) ||
      (m.payment_reference && m.payment_reference.toLowerCase().includes(q))
    );
  }

  result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json(result);
});

// Create Client Onboarding
app.post('/api/members', (req, res) => {
  const { full_name, phone, age, gender, email, emergency_contact, notes, onboarded_by } = req.body;

  if (!full_name || !phone) {
    return res.status(400).json({ error: 'Full name and phone number are required.' });
  }

  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const trainer = profiles.find(p => p.id === onboarded_by) || profiles.find(p => p.role === 'trainer');

  // Auto-detect branch if branch_id is missing or set to 'auto'
  let targetBranchId = req.body.branch_id;
  let targetBranchName = '';
  let memberName = full_name.trim();

  if (!targetBranchId || targetBranchId === 'auto' || targetBranchId === 'br_hq_1') {
    const route = detectBranchFromContactName(full_name);
    targetBranchId = route.branch_id;
    targetBranchName = route.branch_name;
    // If clean_suffix requested or default, use cleaned name
    if (req.body.clean_suffix !== false && route.cleaned_name) {
      memberName = route.cleaned_name;
    }
  } else {
    targetBranchName = (branches.find(b => b.id === targetBranchId) || branches[0])?.name || 'Pulse Fitness - Nagarabhavi';
  }

  const newMember: Member = {
    id: `mem_${Date.now()}`,
    full_name: memberName,
    phone: cleanPhone,
    raw_phone: phone,
    age: age ? parseInt(age) : undefined,
    gender: gender || undefined,
    email: email || undefined,
    emergency_contact: emergency_contact || undefined,
    notes: notes || undefined,
    status: 'pending',
    onboarded_by: trainer ? trainer.id : 'usr_trainer_1',
    trainer_name: trainer ? trainer.full_name : 'Rahul Sharma',
    branch_id: targetBranchId,
    branch_name: targetBranchName,
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  members.unshift(newMember);
  res.status(201).json(newMember);
});

/**
 * Smart Branch Auto-Routing helper for Contact Dumps:
 * - Nagarbhavi clients: "gym" at end of name (e.g. "Arun gym", "Pooja Gym", "gym")
 * - Banashankari clients: "Bsk" tag/suffix (e.g. "Suresh Bsk", "Anita BSK")
 * - RR Nagar clients: "Rr" tag/suffix (e.g. "Karthik Rr", "Pradeep RR", "Rr Nagara")
 */
function detectBranchFromContactName(name: string, defaultBranchId: string = 'br_nag_1'): {
  branch_id: string;
  branch_name: string;
  matched_rule: string;
  matched_keyword: string;
  cleaned_name: string;
} {
  const trimmed = (name || '').trim();

  // 1. Banashankari ("Bsk" or "Banashankari")
  if (/(?:[\s\-_(\[]+|^)bsk(?:\b|[)\]]|\s*$)/i.test(trimmed) || /\bbanashankari\b/i.test(trimmed)) {
    const cleaned = trimmed
      .replace(/[\s\-_(\[]+bsk\s*[)\]]?$/i, '')
      .replace(/[\s\-_(\[]+banashankari\s*[)\]]?$/i, '')
      .replace(/[\s\-_:,()[\]]+$/, '')
      .replace(/^[\s\-_:,()[\]]+/, '')
      .trim();
    const branch = branches.find(b => b.id === 'br_bsk_3') || branches[2] || branches[0];
    return {
      branch_id: branch.id,
      branch_name: branch.name,
      matched_rule: 'Tagged with "Bsk" (Banashankari Branch)',
      matched_keyword: 'Bsk',
      cleaned_name: cleaned || trimmed
    };
  }

  // 2. RR Nagar ("Rr" or "Rr Nagara" or "RR Nagar")
  if (/(?:[\s\-_(\[]+|^)rr(?:\s*nagara?)?(?:\b|[)\]]|\s*$)/i.test(trimmed) || /\b(?:rr\s*nagara?|rajarajeshwari)\b/i.test(trimmed)) {
    const cleaned = trimmed
      .replace(/[\s\-_(\[]+rr\s*nagara?\s*[)\]]?$/i, '')
      .replace(/[\s\-_(\[]+rr\s*[)\]]?$/i, '')
      .replace(/[\s\-_:,()[\]]+$/, '')
      .replace(/^[\s\-_:,()[\]]+/, '')
      .trim();
    const branch = branches.find(b => b.id === 'br_rr_2') || branches[1] || branches[0];
    return {
      branch_id: branch.id,
      branch_name: branch.name,
      matched_rule: 'Tagged with "Rr" (RR Nagar Branch)',
      matched_keyword: 'Rr',
      cleaned_name: cleaned || trimmed
    };
  }

  // 3. Nagarbhavi ("gym" at the end of their name or "nagarbhavi")
  if (/(?:[\s\-_(\[]+|^)gym(?:\b|[)\]]|\s*$)/i.test(trimmed) || /\b(?:nagarbhavi|nagarabhavi)\b/i.test(trimmed)) {
    const cleaned = trimmed
      .replace(/[\s\-_(\[]+gym\s*[)\]]?$/i, '')
      .replace(/[\s\-_(\[]+nagarabhavi\s*[)\]]?$/i, '')
      .replace(/[\s\-_(\[]+nagarbhavi\s*[)\]]?$/i, '')
      .replace(/[\s\-_:,()[\]]+$/, '')
      .replace(/^[\s\-_:,()[\]]+/, '')
      .trim();
    const branch = branches.find(b => b.id === 'br_nag_1') || branches[0];
    return {
      branch_id: branch.id,
      branch_name: branch.name,
      matched_rule: 'Ended with "gym" (Nagarabhavi Branch)',
      matched_keyword: 'gym',
      cleaned_name: cleaned || trimmed
    };
  }

  // Fallback to default branch
  const fallback = branches.find(b => b.id === defaultBranchId) || branches[0];
  return {
    branch_id: fallback.id,
    branch_name: fallback.name,
    matched_rule: 'Defaulted to ' + fallback.name.replace('Pulse Fitness - ', ''),
    matched_keyword: '',
    cleaned_name: trimmed
  };
}

// Quick Dump Contacts Endpoint: Bulk or Single Contact Auto-Routing
app.post('/api/contacts/quick-dump', (req, res) => {
  const { contacts, raw_text, contact, clean_suffix = true, default_branch_id = 'br_nag_1' } = req.body;

  let contactList: Array<{ full_name: string; phone: string; gender?: string; package_type?: string; amount_paid?: number; status?: string; notes?: string }> = [];

  if (contact && typeof contact === 'object' && contact.full_name && contact.phone) {
    contactList.push(contact);
  } else if (Array.isArray(contacts)) {
    contactList = contacts;
  } else if (typeof raw_text === 'string' && raw_text.trim()) {
    const lines = raw_text.trim().split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const phoneMatch = trimmed.match(/(?:\+?91[\s\-]?)?[6-9]\d{4}[\s\-]?\d{5}/) ||
                         trimmed.match(/(?:\+?91[\s\-]?)?\d{10,12}/);
      if (phoneMatch) {
        const rawPhone = phoneMatch[0];
        const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
        let rawName = trimmed.replace(rawPhone, '').trim();
        rawName = rawName.replace(/^[\s\-_:,()[\]]+/, '').replace(/[\s\-_:,()[\]]+$/, '').trim();
        if (cleanPhone.length === 10) {
          contactList.push({
            full_name: rawName || 'Member',
            phone: cleanPhone
          });
        }
      }
    }
  }

  if (contactList.length === 0) {
    return res.status(400).json({ error: 'No valid contacts found. Please supply contact object, contacts array, or raw text lines.' });
  }

  const todayStr = getTodayStr();
  let inserted = 0;
  let skipped_duplicates = 0;
  const skipped_details: any[] = [];
  const results: any[] = [];
  const branch_summary: Record<string, number> = {
    br_nag_1: 0,
    br_bsk_3: 0,
    br_rr_2: 0,
  };

  for (const c of contactList) {
    const rawName = (c.full_name || '').trim();
    if (!rawName) continue;

    const rawPhone = String(c.phone || '').replace(/\D/g, '');
    const phone10 = rawPhone.slice(-10);
    if (!phone10 || phone10.length !== 10) {
      continue;
    }

    // Auto-detect branch based on contact name suffix/keywords
    const detected = detectBranchFromContactName(rawName, default_branch_id);
    const targetBranch = branches.find(b => b.id === detected.branch_id) || branches[0];

    // Check duplicate in that branch
    const existing = members.find(
      m => !m.is_archived && m.branch_id === targetBranch.id && m.phone.replace(/\D/g, '').slice(-10) === phone10
    );

    if (existing) {
      skipped_duplicates++;
      skipped_details.push({
        name: rawName,
        phone: phone10,
        branch_id: targetBranch.id,
        branch_name: targetBranch.name,
        reason: `Already exists in ${targetBranch.name}`
      });
      continue;
    }

    const finalName = clean_suffix ? (detected.cleaned_name || rawName) : rawName;
    const newId = `mem_dump_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const pkgName: PlanPackage = (c.package_type as PlanPackage) || 'General Gym';
    const commRate = getDefaultCommissionRate(pkgName);
    const amtPaid = Number(c.amount_paid) || 0;
    const commAmt = calculateCommissionAmount(amtPaid, commRate);

    const newMem: Member = {
      id: newId,
      full_name: finalName,
      phone: `+91${phone10}`,
      raw_phone: c.phone,
      gender: (c.gender as any) || 'Male',
      status: (c.status as MemberStatus) || 'active',
      package_type: pkgName,
      subscription_months: 1,
      amount_paid: amtPaid,
      balance_due: 0,
      payment_method: 'Cash',
      start_date: todayStr,
      end_date: addMonthsToDate(todayStr, 1),
      branch_id: targetBranch.id,
      branch_name: targetBranch.name,
      onboarded_by: 'usr_owner_1',
      trainer_name: 'Bipin Amrutha',
      commission_rate: commRate,
      commission_amount: commAmt,
      notes: `Smart Auto-Branch Dump: Original "${rawName}" [${detected.matched_rule}]`,
      is_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    members.unshift(newMem);
    inserted++;
    branch_summary[targetBranch.id] = (branch_summary[targetBranch.id] || 0) + 1;

    results.push({
      id: newId,
      original_name: rawName,
      full_name: finalName,
      phone: `+91${phone10}`,
      branch_id: targetBranch.id,
      branch_name: targetBranch.name,
      matched_rule: detected.matched_rule,
      matched_keyword: detected.matched_keyword,
      status: 'inserted'
    });
  }

  // Record audit log
  auditLogs.unshift({
    id: `aud_dump_${Date.now()}`,
    user_id: 'usr_owner_1',
    user_name: 'Bipin Amrutha (Owner)',
    user_role: 'owner',
    action: 'contact_auto_branch_dump',
    entity_type: 'bulk_contact_dump',
    entity_id: 'auto_branch_dump',
    details: `Imported ${inserted} clients without manual branch assignment. Branch distribution: Nagarabhavi: ${branch_summary['br_nag_1'] || 0}, Banashankari: ${branch_summary['br_bsk_3'] || 0}, RR Nagar: ${branch_summary['br_rr_2'] || 0}. Skipped duplicates: ${skipped_duplicates}.`,
    created_at: new Date().toISOString()
  });

  res.json({
    success: true,
    total_processed: contactList.length,
    inserted,
    skipped_duplicates,
    branch_summary,
    skipped_details,
    results
  });
});

// Live Parse & Duplicate Check Preview Endpoint
app.post('/api/contacts/parse-preview', (req, res) => {
  const { contacts, default_branch_id = 'br_nag_1' } = req.body;
  if (!Array.isArray(contacts)) {
    return res.status(400).json({ error: 'contacts array required' });
  }

  const preview = contacts.map(c => {
    const rawName = (c.full_name || '').trim();
    const rawPhone = String(c.phone || '').replace(/\D/g, '');
    const phone10 = rawPhone.slice(-10);
    const detected = detectBranchFromContactName(rawName, default_branch_id);

    const existingBranch = members.find(
      m => !m.is_archived && m.branch_id === detected.branch_id && m.phone.replace(/\D/g, '').slice(-10) === phone10
    );

    const existingOther = !existingBranch && members.find(
      m => !m.is_archived && m.phone.replace(/\D/g, '').slice(-10) === phone10
    );

    return {
      original_name: rawName,
      cleaned_name: detected.cleaned_name || rawName,
      phone: phone10,
      isValidPhone: phone10.length === 10,
      branch_id: detected.branch_id,
      branch_name: detected.branch_name,
      matched_rule: detected.matched_rule,
      matched_keyword: detected.matched_keyword,
      duplicate_status: existingBranch
        ? 'existing_in_branch'
        : existingOther
        ? 'existing_other_branch'
        : 'new',
      duplicate_branch_name: existingOther ? existingOther.branch_name : undefined
    };
  });

  res.json({ preview });
});

// Commission helper: ensures payment row always creates a settlement record for payroll truth
function recordCommissionSettlementOnPayment(
  paymentId: string,
  member: Member,
  amountPaid: number,
  notes?: string
) {
  if (!amountPaid || amountPaid <= 0) return;
  const trainerId = member.onboarded_by || 'usr_trainer_1';
  const trainer = profiles.find((p) => p.id === trainerId);
  const trainerName = trainer ? trainer.full_name : (member.trainer_name || 'Trainer');
  const rate = member.commission_rate ?? getDefaultCommissionRate(member.package_type);
  const commAmount = calculateCommissionAmount(amountPaid, rate);
  if (commAmount <= 0) return;

  const todayStr = getTodayStr();
  const periodMonth = `${todayStr.slice(0, 7)}-01`;
  const branchId = member.branch_id || 'br_nag_1';
  const branch = branches.find((b) => b.id === branchId);

  const settlement: CommissionSettlement = {
    id: `set_line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    trainer_id: trainerId,
    trainer_name: trainerName,
    member_id: member.id,
    member_name: member.full_name,
    member_phone: member.phone,
    branch_id: branchId,
    branch_name: branch ? branch.name : (member.branch_name || 'Pulse Fitness'),
    payment_id: paymentId,
    amount: commAmount,
    rate_percent: rate,
    base_amount: amountPaid,
    package_type: member.package_type,
    period_start: periodMonth,
    period_end: todayStr,
    period_month: periodMonth,
    status: 'pending',
    notes: notes || `Commission for ${member.package_type || 'Membership'} (₹${amountPaid})`,
    created_at: new Date().toISOString()
  };

  commissionSettlements.unshift(settlement);
}

// Activate Member Helper
function processMemberActivation(targetId: string, payload: any, res: express.Response) {
  const {
    subscription_months,
    p_subscription_months,
    package_type,
    p_package_type,
    payment_method,
    p_payment_method,
    amount_paid,
    p_amount_paid,
    balance_due,
    p_balance_due,
    payment_reference,
    p_payment_reference,
    commission_rate,
    p_commission_rate,
    notes,
    p_notes,
    activated_by,
    p_actor_id
  } = payload || {};

  const member = members.find(m => m.id === targetId);
  if (!member) {
    return res.status(404).json({ error: 'Member record not found.' });
  }

  const subMonths = subscription_months !== undefined ? subscription_months : p_subscription_months;
  const pkgType = package_type || p_package_type;
  const payMethod = payment_method || p_payment_method;
  const amtPaid = amount_paid !== undefined ? amount_paid : p_amount_paid;
  const balDue = balance_due !== undefined ? balance_due : p_balance_due;
  const payRef = payment_reference || p_payment_reference;
  const commRateInput = commission_rate !== undefined ? commission_rate : p_commission_rate;
  const noteText = notes || p_notes;
  const actorId = activated_by || p_actor_id;

  const months = subMonths ? parseInt(String(subMonths)) : 1;
  const pkg: PlanPackage = pkgType || 'General Gym';
  const pkgConfig = PACKAGE_CONFIGS[pkg] || PACKAGE_CONFIGS['General Gym'];

  const today = getTodayStr();
  const endDate = addMonthsToDate(today, months);

  const paidVal = amtPaid !== undefined ? parseFloat(String(amtPaid)) : (pkgConfig.pricePerMonth * months);
  const dueVal = balDue !== undefined ? parseFloat(String(balDue)) : 0;
  const commRate = commRateInput !== undefined ? parseFloat(String(commRateInput)) : pkgConfig.defaultCommissionRate;

  const calculatedCommission = calculateCommissionAmount(paidVal, commRate);

  member.status = 'active';
  member.subscription_months = months;
  member.package_type = pkg;
  member.payment_method = payMethod || 'UPI / GPay / PhonePe';
  member.amount_paid = paidVal;
  member.balance_due = dueVal;
  member.payment_reference = payRef || undefined;
  member.commission_rate = commRate;
  member.commission_amount = calculatedCommission;
  member.start_date = today;
  member.end_date = endDate;
  if (noteText) {
    member.notes = member.notes ? `${member.notes} | ${noteText}` : noteText;
  }
  member.updated_at = new Date().toISOString();

  const payId = `pay_${Date.now()}`;
  const activator = profiles.find(p => p.id === actorId) || profiles.find(p => p.id === member.onboarded_by);
  paymentHistory.unshift({
    id: payId,
    member_id: member.id,
    amount: paidVal,
    payment_method: member.payment_method,
    payment_reference: member.payment_reference,
    notes: `Activation payment for ${pkg} (${months} months)`,
    received_by: activator ? activator.id : member.onboarded_by,
    received_by_name: activator ? activator.full_name : member.trainer_name,
    created_at: new Date().toISOString()
  });

  // Always write commission settlement row on activate (payroll truth)
  recordCommissionSettlementOnPayment(payId, member, paidVal, `Activation commission (${pkg})`);

  // Win-back conversion trigger
  convertWinbackEnrollmentOnPayment(member.id);
  refreshChurnPredictions();

  return res.json(member);
}

// Activate Member (Universal Endpoint)
app.post('/api/members/activate', (req, res) => {
  const targetId = req.body?.p_member_id || req.body?.member_id || req.body?.id;
  if (!targetId) {
    return res.status(400).json({ error: 'Target member ID required' });
  }
  processMemberActivation(targetId, req.body, res);
});

// Activate Member with Financials & Commission Capture (Param Endpoint)
app.post('/api/members/:id/activate', (req, res) => {
  const { id } = req.params;
  processMemberActivation(id, req.body, res);
});

// Add Partial Payment / Top-up
app.post('/api/members/:id/payment', (req, res) => {
  const { id } = req.params;
  const { amount, payment_method, payment_reference, notes, received_by } = req.body;

  const member = members.find(m => m.id === id);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const payVal = parseFloat(amount || 0);
  if (payVal <= 0) {
    return res.status(400).json({ error: 'Valid positive payment amount required' });
  }

  member.amount_paid = (member.amount_paid || 0) + payVal;
  member.balance_due = Math.max(0, (member.balance_due || 0) - payVal);

  // Recalculate commission based on newly increased paid amount
  const commRate = member.commission_rate ?? getDefaultCommissionRate(member.package_type);
  member.commission_amount = calculateCommissionAmount(member.amount_paid, commRate);
  member.updated_at = new Date().toISOString();

  const payId = `pay_${Date.now()}`;
  const receiver = profiles.find(p => p.id === received_by) || profiles[0];
  const payRecord: PaymentRecord = {
    id: payId,
    member_id: member.id,
    amount: payVal,
    payment_method: payment_method || 'UPI / GPay / PhonePe',
    payment_reference: payment_reference || undefined,
    notes: notes || 'Balance top-up payment',
    received_by: receiver.id,
    received_by_name: receiver.full_name,
    created_at: new Date().toISOString()
  };

  paymentHistory.unshift(payRecord);

  // Write commission settlement row on payment
  recordCommissionSettlementOnPayment(payId, member, payVal, `Balance payment commission (${member.package_type})`);

  // Win-back conversion trigger
  convertWinbackEnrollmentOnPayment(member.id);
  refreshChurnPredictions();

  res.json({ member, paymentRecord: payRecord });
});

// Renew Membership Endpoint
app.post('/api/members/:id/renew', (req, res) => {
  const { id } = req.params;
  const {
    subscription_months,
    package_type,
    payment_method,
    amount_paid,
    balance_due,
    payment_reference,
    commission_rate,
    notes,
    renewed_by
  } = req.body;

  const member = members.find(m => m.id === id);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const months = subscription_months ? parseInt(subscription_months) : 1;
  const pkg: PlanPackage = package_type || member.package_type || 'General Gym';
  const pkgConfig = PACKAGE_CONFIGS[pkg] || PACKAGE_CONFIGS['General Gym'];

  // Start date calculation: if end_date exists & in future, extend from end_date else today
  const todayStr = getTodayStr();
  let startDate = todayStr;
  if (member.end_date && member.end_date >= todayStr) {
    startDate = member.end_date;
  }
  const newEndDate = addMonthsToDate(startDate, months);

  const newPaidVal = amount_paid !== undefined ? parseFloat(amount_paid) : (pkgConfig.pricePerMonth * months);
  const newDueVal = balance_due !== undefined ? parseFloat(balance_due) : 0;
  const commRate = commission_rate !== undefined ? parseFloat(commission_rate) : pkgConfig.defaultCommissionRate;

  member.status = 'active';
  member.package_type = pkg;
  member.subscription_months = months;
  member.payment_method = payment_method || 'UPI / GPay / PhonePe';
  member.amount_paid = (member.amount_paid || 0) + newPaidVal;
  member.balance_due = newDueVal;
  member.payment_reference = payment_reference || undefined;
  member.commission_rate = commRate;
  
  // Update total stored commission for trainer
  const totalComm = calculateCommissionAmount(member.amount_paid, commRate);
  member.commission_amount = totalComm;

  member.start_date = startDate;
  member.end_date = newEndDate;
  member.notes = member.notes ? `${member.notes} | Renewed ${months}m on ${todayStr}` : `Renewed ${months}m on ${todayStr}`;
  member.updated_at = new Date().toISOString();

  const payId = `pay_${Date.now()}`;
  const renewer = profiles.find(p => p.id === renewed_by) || profiles[0];
  paymentHistory.unshift({
    id: payId,
    member_id: member.id,
    amount: newPaidVal,
    payment_method: member.payment_method,
    payment_reference: member.payment_reference,
    notes: `Renewal payment for ${pkg} (${months} months)`,
    received_by: renewer.id,
    received_by_name: renewer.full_name,
    created_at: new Date().toISOString()
  });

  // Always write commission settlement row on renewal (payroll truth)
  recordCommissionSettlementOnPayment(payId, member, newPaidVal, `Renewal commission (${pkg} - ${months}m)`);

  // Win-back conversion trigger
  convertWinbackEnrollmentOnPayment(member.id);
  refreshChurnPredictions();

  res.json(member);
});

// Bulk Member Operations API
app.post('/api/members/bulk-update', (req, res) => {
  const { member_ids, status, trainer_id, updated_by } = req.body;
  if (!Array.isArray(member_ids) || member_ids.length === 0) {
    return res.status(400).json({ error: 'member_ids must be a non-empty array' });
  }

  const targetTrainer = trainer_id ? profiles.find(p => p.id === trainer_id) : null;
  let updatedCount = 0;

  for (const memId of member_ids) {
    const mem = members.find(m => m.id === memId && !m.is_archived);
    if (mem) {
      if (status) {
        mem.status = status;
      }
      if (targetTrainer) {
        mem.onboarded_by = targetTrainer.id;
        mem.trainer_name = targetTrainer.full_name;
      }
      mem.updated_at = new Date().toISOString();
      updatedCount++;

      crmActivities.unshift({
        id: `crm_${Date.now()}_${mem.id}`,
        member_id: mem.id,
        branch_id: mem.branch_id,
        type: 'note',
        title: `⚡ Bulk Member Update`,
        description: `Status: ${status || 'unchanged'} · Trainer: ${targetTrainer ? targetTrainer.full_name : 'unchanged'}`,
        actor_name: updated_by || 'Staff',
        created_at: new Date().toISOString()
      });
    }
  }

  res.json({ success: true, updated_count: updatedCount });
});

// Soft Archive Member
app.post('/api/members/:id/archive', (req, res) => {
  const { id } = req.params;
  const { archived_by } = req.body;

  const member = members.find(m => m.id === id);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  member.is_archived = true;
  member.archived_at = new Date().toISOString();
  member.archived_by = archived_by || 'usr_owner_1';
  member.updated_at = new Date().toISOString();

  res.json(member);
});

// Restore Member from Archive
app.post('/api/members/:id/restore', (req, res) => {
  const { id } = req.params;

  const member = members.find(m => m.id === id);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  member.is_archived = false;
  member.archived_at = undefined;
  member.archived_by = undefined;
  member.updated_at = new Date().toISOString();

  res.json(member);
});

// Attendance Check-in API
app.get('/api/attendance', (req, res) => {
  const { member_id, trainer_id, branch_id, from, to } = req.query;
  let list = [...attendanceLogs];

  if (member_id && typeof member_id === 'string') {
    list = list.filter(a => a.member_id === member_id);
  }
  if (trainer_id && typeof trainer_id === 'string') {
    list = list.filter(a => a.checked_in_by === trainer_id);
  }
  if (branch_id && typeof branch_id === 'string' && branch_id !== 'all') {
    list = list.filter(a => a.branch_id === branch_id || members.find(m => m.id === a.member_id)?.branch_id === branch_id);
  }
  if (from && typeof from === 'string') {
    const fromDate = new Date(from);
    list = list.filter(a => new Date(a.checked_in_at) >= fromDate);
  }
  if (to && typeof to === 'string') {
    const toDate = new Date(to);
    list = list.filter(a => new Date(a.checked_in_at) <= toDate);
  }

  const enriched = list.map(a => {
    const mem = members.find(m => m.id === a.member_id);
    const branchId = a.branch_id || mem?.branch_id || 'br_nag_1';
    const br = branches.find(b => b.id === branchId);
    const st = profiles.find(p => p.id === a.checked_in_by);

    return {
      ...a,
      branch_id: branchId,
      member: mem ? { id: mem.id, full_name: mem.full_name, phone: mem.phone, package_type: mem.package_type } : { id: a.member_id, full_name: a.member_name, phone: '', package_type: a.member_package },
      branch: br ? { id: br.id, name: br.name } : { id: branchId, name: 'Pulse Fitness - Nagarbhavi' },
      staff: st ? { id: st.id, full_name: st.full_name } : { id: a.checked_in_by, full_name: a.checked_in_by_name || 'Staff' }
    };
  });

  enriched.sort((a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime());
  res.json(enriched);
});

app.post('/api/attendance/check-in', (req, res) => {
  syncMemberExpiries();
  const { member_id, checked_in_by, method, notes } = req.body;

  if (!member_id) {
    return res.status(400).json({ error: 'Member ID required for check-in' });
  }

  const member = members.find(m => m.id === member_id || m.phone === member_id);
  if (!member) {
    return res.status(404).json({ error: 'Member record not found' });
  }

  if (member.is_archived) {
    return res.status(400).json({ error: 'Cannot check in an archived member. Please restore member first.' });
  }

  const checker = profiles.find(p => p.id === checked_in_by) || profiles[0];

  const record: AttendanceRecord = {
    id: `att_${Date.now()}`,
    member_id: member.id,
    member_name: member.full_name,
    member_package: member.package_type,
    checked_in_at: new Date().toISOString(),
    checked_in_by: checker.id,
    checked_in_by_name: checker.full_name,
    method: method || 'qr',
    notes: notes || undefined
  };

  attendanceLogs.unshift(record);

  // Auto-resolve stale attendance alerts upon QR/manual check-in
  const staleAlerts = retentionAlerts.filter(a => a.member_id === member.id && !a.is_resolved && (a.alert_type === 'at_risk' || a.message?.toLowerCase().includes('absent') || a.message?.toLowerCase().includes('check-in')));
  staleAlerts.forEach(a => {
    a.is_resolved = true;
    a.resolved_at = new Date().toISOString();
    a.resolved_by = checker.full_name;
  });

  res.status(201).json({ success: true, record, member, auto_resolved_alerts: staleAlerts.length });
});

// Staff Attendance REST Endpoints
app.get('/api/staff-attendance', (req, res) => {
  const { branch_id, day, staff_id } = req.query;
  let list = [...staffAttendanceLogs];

  if (staff_id && typeof staff_id === 'string') {
    list = list.filter(s => s.staff_id === staff_id);
  }

  if (branch_id && typeof branch_id === 'string' && branch_id !== 'all') {
    list = list.filter(s => s.branch_id === branch_id);
  }

  if (day && typeof day === 'string') {
    const dayStr = day.slice(0, 10);
    list = list.filter(s => s.checked_in_at.slice(0, 10) === dayStr);
  }

  const enriched = list.map(s => {
    const profile = profiles.find(p => p.id === s.staff_id);
    const branch = branches.find(b => b.id === s.branch_id);
    return {
      ...s,
      profiles: profile ? { full_name: profile.full_name, role: profile.role, avatar: profile.avatar } : { full_name: 'Trainer / Staff', role: 'trainer' },
      branch_name: branch?.name || 'Pulse Fitness'
    };
  });

  enriched.sort((a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime());
  res.json(enriched);
});

app.get('/api/staff-attendance/open-shift/:staffId', (req, res) => {
  const { staffId } = req.params;
  const openShift = staffAttendanceLogs.find(s => s.staff_id === staffId && !s.checked_out_at);
  if (!openShift) {
    return res.json(null);
  }
  const profile = profiles.find(p => p.id === openShift.staff_id);
  const branch = branches.find(b => b.id === openShift.branch_id);
  res.json({
    ...openShift,
    profiles: profile ? { full_name: profile.full_name, role: profile.role } : null,
    branch_name: branch?.name || 'Pulse Fitness'
  });
});

// Stale Members API
app.get('/api/retention/stale-members', (req, res) => {
  const { days, branch_id } = req.query;
  const thresholdDays = days ? parseInt(days as string) : 14;
  const cutoffDate = new Date(Date.now() - thresholdDays * 24 * 3600 * 1000);

  let activeMems = members.filter(m => m.status === 'active' && !m.is_archived);
  if (branch_id && branch_id !== 'all') {
    activeMems = activeMems.filter(m => m.branch_id === branch_id);
  }

  const staleList = [];
  for (const m of activeMems) {
    const memLogs = attendanceLogs.filter(a => a.member_id === m.id);
    if (memLogs.length === 0) {
      staleList.push({
        id: m.id,
        full_name: m.full_name,
        phone: m.phone,
        branch_id: m.branch_id,
        branch_name: m.branch_name,
        status: m.status,
        end_date: m.end_date,
        lastCheckIn: null,
        daysSince: 999,
        isFlagged: retentionAlerts.some(a => a.member_id === m.id && !a.is_resolved)
      });
    } else {
      const sorted = [...memLogs].sort((a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime());
      const latest = new Date(sorted[0].checked_in_at);
      if (latest < cutoffDate) {
        const daysSince = Math.floor((Date.now() - latest.getTime()) / (24 * 3600 * 1000));
        staleList.push({
          id: m.id,
          full_name: m.full_name,
          phone: m.phone,
          branch_id: m.branch_id,
          branch_name: m.branch_name,
          status: m.status,
          end_date: m.end_date,
          lastCheckIn: sorted[0].checked_in_at,
          daysSince,
          isFlagged: retentionAlerts.some(a => a.member_id === m.id && !a.is_resolved)
        });
      }
    }
  }

  staleList.sort((a, b) => b.daysSince - a.daysSince);
  res.json(staleList);
});

app.post('/api/retention/flag-stale', (req, res) => {
  const { member_id, branch_id, days_since } = req.body;
  const mem = members.find(m => m.id === member_id);
  if (!mem) return res.status(404).json({ error: 'Member not found' });

  const existing = retentionAlerts.find(a => a.member_id === member_id && !a.is_resolved);
  if (existing) {
    return res.json({ success: true, alert: existing, note: 'Alert already open' });
  }

  const alertId = `alt_stale_${Date.now()}`;
  const newAlert: RetentionAlert = {
    id: alertId,
    member_id: mem.id,
    branch_id: branch_id || mem.branch_id,
    alert_type: 'at_risk',
    severity: 'high',
    message: `No check-in for ${days_since >= 999 ? '14+' : days_since} days · Retention Action Required`,
    is_resolved: false,
    created_at: new Date().toISOString()
  };

  retentionAlerts.unshift(newAlert);
  res.status(201).json({ success: true, alert: newAlert });
});

// Trainer Payroll API
app.get('/api/trainer-payroll', (req, res) => {
  const { period_month, branch_id } = req.query;
  const targetMonth = typeof period_month === 'string'
    ? (period_month.length === 7 ? `${period_month}-01` : period_month)
    : `${getTodayStr().slice(0, 7)}-01`;

  let matchingSettlements = commissionSettlements.filter(s => {
    const sMonth = s.period_month || `${(s.period_start || s.created_at).slice(0, 7)}-01`;
    return sMonth === targetMonth && s.status !== 'void';
  });

  if (branch_id && branch_id !== 'all') {
    matchingSettlements = matchingSettlements.filter(s => s.branch_id === branch_id);
  }

  const trainerProfiles = profiles.filter(p => p.role === 'trainer' || p.role === 'branch_manager' || p.role === 'owner' || p.role === 'super_owner');

  const trainersSummary = trainerProfiles.map(t => {
    const tRows = matchingSettlements.filter(s => s.trainer_id === t.id);
    const pendingRows = tRows.filter(s => s.status === 'pending');
    const paidRows = tRows.filter(s => s.status === 'paid');

    const pending = pendingRows.reduce((sum, s) => sum + (s.amount || s.total_commission || 0), 0);
    const paid = paidRows.reduce((sum, s) => sum + (s.amount || s.total_commission || 0), 0);

    return {
      trainerId: t.id,
      name: t.full_name,
      role: t.role,
      branchName: t.branch_name,
      pending,
      paid,
      total: pending + paid,
      rowIdsPending: pendingRows.map(r => r.id),
      rowIdsPaid: paidRows.map(r => r.id)
    };
  }).filter(t => t.total > 0 || t.role === 'trainer');

  const grandPending = matchingSettlements
    .filter(s => s.status === 'pending')
    .reduce((sum, s) => sum + (s.amount || s.total_commission || 0), 0);

  const grandPaid = matchingSettlements
    .filter(s => s.status === 'paid')
    .reduce((sum, s) => sum + (s.amount || s.total_commission || 0), 0);

  res.json({
    period: targetMonth,
    trainers: trainersSummary,
    grandPending,
    grandPaid,
    grandTotal: grandPending + grandPaid
  });
});

app.post('/api/trainer-payroll/mark-paid', (req, res) => {
  const { trainer_id, period_month, settlement_ids, paid_by } = req.body;
  let targetRows: CommissionSettlement[] = [];

  if (settlement_ids && Array.isArray(settlement_ids) && settlement_ids.length > 0) {
    targetRows = commissionSettlements.filter(s => settlement_ids.includes(s.id));
  } else if (trainer_id) {
    targetRows = commissionSettlements.filter(s => s.trainer_id === trainer_id && s.status === 'pending');
  }

  const nowIso = new Date().toISOString();
  targetRows.forEach(s => {
    s.status = 'paid';
    s.paid_at = nowIso;
    s.paid_by = paid_by || 'usr_owner_1';
  });

  res.json({ success: true, updated_count: targetRows.length });
});

app.post('/api/trainer-payroll/mark-pending', (req, res) => {
  const { trainer_id, period_month, settlement_ids } = req.body;
  let targetRows: CommissionSettlement[] = [];

  if (settlement_ids && Array.isArray(settlement_ids) && settlement_ids.length > 0) {
    targetRows = commissionSettlements.filter(s => settlement_ids.includes(s.id));
  } else if (trainer_id) {
    targetRows = commissionSettlements.filter(s => s.trainer_id === trainer_id && s.status === 'paid');
  }

  targetRows.forEach(s => {
    s.status = 'pending';
    s.paid_at = undefined;
    s.paid_by = undefined;
  });

  res.json({ success: true, updated_count: targetRows.length });
});

// Payroll Reconciliation Report API
app.get('/api/payroll-reconciliation', (req, res) => {
  const { period_month, branch_id } = req.query;
  const targetMonth = typeof period_month === 'string'
    ? (period_month.length === 7 ? `${period_month}-01` : period_month)
    : `${getTodayStr().slice(0, 7)}-01`;

  let matching = commissionSettlements.filter(s => {
    const sMonth = s.period_month || `${(s.period_start || s.created_at).slice(0, 7)}-01`;
    return sMonth === targetMonth;
  });

  if (branch_id && branch_id !== 'all') {
    matching = matching.filter(s => s.branch_id === branch_id);
  }

  const trainersList = profiles.filter(p => p.role === 'trainer' || p.role === 'branch_manager' || p.role === 'owner');

  const rows = trainersList.map(t => {
    const tRows = matching.filter(s => s.trainer_id === t.id);
    const pendingLines = tRows.filter(s => s.status === 'pending');
    const paidLines = tRows.filter(s => s.status === 'paid');
    const voidLines = tRows.filter(s => s.status === 'void');

    const pending_amount = pendingLines.reduce((s, r) => s + (r.amount || r.total_commission || 0), 0);
    const paid_amount = paidLines.reduce((s, r) => s + (r.amount || r.total_commission || 0), 0);
    const void_amount = voidLines.reduce((s, r) => s + (r.amount || r.total_commission || 0), 0);
    const earned_amount = pending_amount + paid_amount;

    return {
      period_month: targetMonth,
      branch_id: t.branch_id,
      branch_name: t.branch_name,
      trainer_id: t.id,
      trainer_name: t.full_name,
      pending_lines: pendingLines.length,
      paid_lines: paidLines.length,
      void_lines: voidLines.length,
      pending_amount,
      paid_amount,
      void_amount,
      earned_amount,
      variance: 0
    };
  }).filter(r => r.earned_amount > 0 || r.pending_amount > 0 || r.paid_amount > 0 || r.void_amount > 0);

  res.json({ period_month: targetMonth, rows });
});

// Payroll Itemized Lines API
app.get('/api/payroll-lines', (req, res) => {
  const { period_month, trainer_id, branch_id } = req.query;
  const targetMonth = typeof period_month === 'string'
    ? (period_month.length === 7 ? `${period_month}-01` : period_month)
    : `${getTodayStr().slice(0, 7)}-01`;

  let list = commissionSettlements.filter(s => {
    const sMonth = s.period_month || `${(s.period_start || s.created_at).slice(0, 7)}-01`;
    return sMonth === targetMonth;
  });

  if (trainer_id && typeof trainer_id === 'string') {
    list = list.filter(s => s.trainer_id === trainer_id);
  }
  if (branch_id && typeof branch_id === 'string' && branch_id !== 'all') {
    list = list.filter(s => s.branch_id === branch_id);
  }

  list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json(list);
});

// Commission Settlements API (Legacy backwards-compatible)
app.get('/api/commission-settlements', (req, res) => {
  const { trainer_id } = req.query;
  let list = [...commissionSettlements];

  if (trainer_id && typeof trainer_id === 'string') {
    list = list.filter(s => s.trainer_id === trainer_id);
  }

  list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json(list);
});

app.post('/api/commission-settlements', (req, res) => {
  const { trainer_id, period_start, period_end, total_commission, notes } = req.body;

  if (!trainer_id || !total_commission) {
    return res.status(400).json({ error: 'Trainer ID and settlement commission amount are required.' });
  }

  const trainer = profiles.find(p => p.id === trainer_id);
  if (!trainer) {
    return res.status(404).json({ error: 'Trainer profile not found' });
  }

  const todayStr = getTodayStr();

  const newSettlement: CommissionSettlement = {
    id: `set_${Date.now()}`,
    trainer_id: trainer.id,
    trainer_name: trainer.full_name,
    period_start: period_start || addMonthsToDate(todayStr, -1),
    period_end: period_end || todayStr,
    period_month: `${todayStr.slice(0, 7)}-01`,
    amount: parseFloat(total_commission),
    total_commission: parseFloat(total_commission),
    status: 'paid',
    paid_at: new Date().toISOString(),
    notes: notes || 'Settlement paid by Owner',
    created_at: new Date().toISOString()
  };

  commissionSettlements.unshift(newSettlement);
  res.status(201).json(newSettlement);
});

// Export Logs Audit API
app.get('/api/export-logs', (req, res) => {
  const list = [...exportLogs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json(list);
});

app.post('/api/export-logs', (req, res) => {
  const { exported_by, export_type, filter_used, member_count, row_count, meta } = req.body;

  const exporter = profiles.find(p => p.id === exported_by) || profiles[0];

  const log: ExportLogRecord = {
    id: `exp_${Date.now()}`,
    exported_by: exporter.id,
    exported_by_name: exporter.full_name,
    export_type: export_type || 'members_csv',
    filter_used: filter_used || (meta ? JSON.stringify(meta) : 'Filtered Members'),
    member_count: row_count || member_count || 0,
    created_at: new Date().toISOString()
  };

  exportLogs.unshift(log);
  res.status(201).json(log);
});

// System Audit Logs API
app.get('/api/audit-logs', (req, res) => {
  const branch_id = req.query.branch_id as string;
  let list = [...auditLogs];
  if (branch_id && branch_id !== 'all') {
    list = list.filter(l => !l.branch_id || l.branch_id === branch_id);
  }
  list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json(list);
});

app.post('/api/audit-logs', (req, res) => {
  const { action, user_id, user_name, entity_type, entity_id, branch_id, details } = req.body;
  const user = profiles.find(p => p.id === user_id) || profiles[0];
  const newLog: AuditLog = {
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    action: action || 'Action recorded',
    user_id: user.id,
    user_name: user_name || user.full_name,
    user_role: user.role || 'super_owner',
    entity_type: entity_type || 'system',
    entity_id: entity_id || undefined,
    branch_id: branch_id || user.branch_id || undefined,
    details: details ? (typeof details === 'string' ? details : JSON.stringify(details)) : undefined,
    created_at: new Date().toISOString()
  };
  auditLogs.unshift(newLog);
  res.status(201).json(newLog);
});

// Unified Payments API
app.get('/api/payments', (req, res) => {
  const { member_id, branch_id } = req.query;
  let list = [...paymentHistory];
  if (member_id) {
    list = list.filter(p => p.member_id === member_id);
  }
  if (branch_id && branch_id !== 'all') {
    list = list.filter(p => p.branch_id === branch_id);
  }
  res.json(list);
});

app.post('/api/payments', (req, res) => {
  const {
    member_id,
    branch_id,
    amount,
    method,
    payment_method,
    reference,
    payment_reference,
    package_type,
    notes,
    recorded_by,
    received_by,
    idempotency_key
  } = req.body;

  if (idempotency_key) {
    const existing = paymentHistory.find(p => p.idempotency_key === idempotency_key);
    if (existing) {
      return res.json({ payment: existing, replayed: true });
    }
  }

  const targetMemberId = member_id;
  const member = members.find(m => m.id === targetMemberId);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const payVal = parseFloat(amount || 0);
  if (payVal <= 0) {
    return res.status(400).json({ error: 'Valid positive payment amount required' });
  }

  member.amount_paid = (member.amount_paid || 0) + payVal;
  member.balance_due = Math.max(0, (member.balance_due || 0) - payVal);

  const commRate = member.commission_rate ?? getDefaultCommissionRate(member.package_type);
  member.commission_amount = calculateCommissionAmount(member.amount_paid, commRate);
  member.updated_at = new Date().toISOString();

  const receiverId = recorded_by || received_by;
  const receiver = profiles.find(p => p.id === receiverId) || profiles[0];
  const payId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const payMethod = method || payment_method || 'UPI / GPay / PhonePe';
  const payRef = reference || payment_reference;

  const payRecord: PaymentRecord = {
    id: payId,
    member_id: member.id,
    amount: payVal,
    payment_method: payMethod,
    payment_reference: payRef || undefined,
    notes: notes || `Payment recorded (${package_type || member.package_type})`,
    received_by: receiver.id,
    received_by_name: receiver.full_name,
    branch_id: branch_id || member.branch_id,
    idempotency_key: idempotency_key || undefined,
    entry_type: 'balance',
    created_at: new Date().toISOString()
  };

  paymentHistory.unshift(payRecord);
  recordCommissionSettlementOnPayment(payId, member, payVal, `Payment top-up settlement`);

  res.status(201).json({ success: true, payment: payRecord, member });
});

// Line-Level Payroll & Commission Settlements API (Matches SQL View & RPC get_payroll_lines)
app.get('/api/payroll/lines', (req, res) => {
  const period_month = req.query.p_period_month || req.query.period_month;
  const branch_id = req.query.p_branch_id || req.query.branch_id;
  const trainer_id = req.query.p_trainer_id || req.query.trainer_id;
  const status = req.query.p_status || req.query.status;

  const targetMonth = typeof period_month === 'string'
    ? (period_month.length === 7 ? `${period_month}-01` : period_month)
    : `${getTodayStr().slice(0, 7)}-01`;

  let list = commissionSettlements.filter(s => {
    const sMonth = s.period_month || `${(s.period_start || s.created_at).slice(0, 7)}-01`;
    return sMonth === targetMonth;
  });

  if (branch_id && typeof branch_id === 'string' && branch_id !== 'all') {
    list = list.filter(s => s.branch_id === branch_id);
  }
  if (trainer_id && typeof trainer_id === 'string' && trainer_id !== 'all') {
    list = list.filter(s => s.trainer_id === trainer_id);
  }
  if (status && typeof status === 'string' && status !== 'all') {
    list = list.filter(s => s.status === status);
  }

  // Map to full line-level view structure (payroll_settlement_lines)
  const lines: PayrollSettlementLine[] = list.map(cs => {
    const b = branches.find(br => br.id === cs.branch_id);
    const tr = profiles.find(p => p.id === cs.trainer_id);
    const mem = members.find(m => m.id === cs.member_id);
    const payer = profiles.find(p => p.id === cs.paid_by);

    return {
      settlement_id: cs.id,
      period_month: cs.period_month || targetMonth,
      branch_id: cs.branch_id,
      branch_name: b?.name || cs.branch_name || 'Pulse Fitness',
      trainer_id: cs.trainer_id,
      trainer_name: tr?.full_name || cs.trainer_name || 'Trainer',
      member_id: cs.member_id,
      member_name: mem?.full_name || cs.member_name || 'Member',
      member_phone: mem?.phone || cs.member_phone,
      payment_id: cs.payment_id,
      base_amount: cs.base_amount || (cs.amount && cs.rate_percent ? Math.round(cs.amount / (cs.rate_percent / 100)) : cs.amount || 0),
      rate_percent: cs.rate_percent || 10,
      commission_amount: cs.amount || cs.total_commission || 0,
      package_type: cs.package_type || mem?.package_type || 'General Gym',
      status: cs.status,
      notes: cs.notes,
      created_at: cs.created_at,
      paid_at: cs.paid_at,
      paid_by: cs.paid_by,
      paid_by_name: payer?.full_name
    };
  });

  lines.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json(lines);
});

// ==========================================
// AUTOMATED CHURN & WIN-BACK CAMPAIGN APIS
// ==========================================

// 1. Churn Predictions List & Summary
app.get('/api/churn/predictions', (req, res) => {
  const { branch_id, band, search } = req.query;
  let list = [...memberChurnPredictions];

  if (branch_id && typeof branch_id === 'string' && branch_id !== 'all') {
    list = list.filter(p => p.branch_id === branch_id);
  }
  if (band && typeof band === 'string' && band !== 'all') {
    list = list.filter(p => p.risk_band === band);
  }
  if (search && typeof search === 'string') {
    const q = search.toLowerCase().trim();
    list = list.filter(p =>
      p.member_name.toLowerCase().includes(q) ||
      p.member_phone.includes(q) ||
      (p.member_email && p.member_email.toLowerCase().includes(q))
    );
  }

  list.sort((a, b) => b.churn_probability - a.churn_probability);

  const totalMembers = memberChurnPredictions.length;
  const criticalCount = memberChurnPredictions.filter(p => p.risk_band === 'critical').length;
  const highCount = memberChurnPredictions.filter(p => p.risk_band === 'high').length;
  const mediumCount = memberChurnPredictions.filter(p => p.risk_band === 'medium').length;
  const lowCount = memberChurnPredictions.filter(p => p.risk_band === 'low').length;

  const avgProb = totalMembers > 0
    ? Math.round((memberChurnPredictions.reduce((acc, p) => acc + p.churn_probability, 0) / totalMembers) * 1000) / 10
    : 0;

  res.json({
    predictions: list,
    summary: {
      total: totalMembers,
      critical: criticalCount,
      high: highCount,
      medium: mediumCount,
      low: lowCount,
      avg_churn_rate_percent: avgProb
    },
    in_silence_hours: inSilenceHoursIST()
  });
});

// Churn Risk Distribution by Branch (Network Aggregate)
app.get('/api/retention/churn-risk-distribution', (req, res) => {
  const { branch_id } = req.query;
  refreshChurnPredictions();

  const map = new Map<string, {
    branch_id: string | null;
    branch_name: string;
    low: number;
    medium: number;
    high: number;
    critical: number;
    total: number;
    avg_probability: number;
  }>();

  for (const b of branches) {
    if (!branch_id || branch_id === 'all' || branch_id === b.id) {
      map.set(b.id, {
        branch_id: b.id,
        branch_name: b.name,
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
        total: 0,
        avg_probability: 0,
      });
    }
  }

  for (const row of memberChurnPredictions) {
    const id = row.branch_id || 'br_nag_1';
    if (branch_id && branch_id !== 'all' && id !== branch_id) {
      continue;
    }
    if (!map.has(id)) {
      const bObj = branches.find(b => b.id === id);
      map.set(id, {
        branch_id: id,
        branch_name: bObj?.name || row.branch_name || 'Pulse Branch',
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
        total: 0,
        avg_probability: 0,
      });
    }
    const b = map.get(id)!;
    const band = (row.risk_band || 'low') as 'low' | 'medium' | 'high' | 'critical';
    if (band in b) {
      b[band] += 1;
    }
    b.total += 1;
    b.avg_probability += Number(row.churn_probability || 0);
  }

  const result = [...map.values()]
    .map((b) => ({
      ...b,
      avg_probability: b.total > 0 ? Math.round((b.avg_probability / b.total) * 1000) / 1000 : 0,
    }))
    .sort((a, b) => b.critical + b.high - (a.critical + a.high));

  res.json({ distribution: result });
});

// 2. Batch Refresh Churn Predictions
app.post('/api/churn/refresh', (req, res) => {
  const result = refreshChurnPredictions();
  res.json({ success: true, ...result });
});

// 3. Winback Campaigns Management
app.get('/api/winback/campaigns', (req, res) => {
  res.json(winbackCampaigns);
});

app.post('/api/winback/campaigns', (req, res) => {
  const { id, name, min_probability, channels, max_attempts, cooldown_hours, is_active } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Campaign name is required' });
  }

  let campaign = winbackCampaigns.find(c => c.id === id);
  if (campaign) {
    if (min_probability !== undefined) campaign.min_probability = Number(min_probability);
    if (channels !== undefined) campaign.channels = channels;
    if (max_attempts !== undefined) campaign.max_attempts = Number(max_attempts);
    if (cooldown_hours !== undefined) campaign.cooldown_hours = Number(cooldown_hours);
    if (is_active !== undefined) campaign.is_active = Boolean(is_active);
    campaign.name = name;
  } else {
    campaign = {
      id: id || `cmp_${Date.now()}`,
      name,
      min_probability: min_probability !== undefined ? Number(min_probability) : 0.55,
      channels: channels || ['whatsapp', 'sms', 'email'],
      max_attempts: max_attempts !== undefined ? Number(max_attempts) : 3,
      cooldown_hours: cooldown_hours !== undefined ? Number(cooldown_hours) : 48,
      is_active: is_active !== undefined ? Boolean(is_active) : true,
      created_at: new Date().toISOString()
    };
    winbackCampaigns.push(campaign);
  }

  res.json(campaign);
});

// 4. Winback Enrollments List
app.get('/api/winback/enrollments', (req, res) => {
  const { campaign_id, status, branch_id, search } = req.query;
  let list = [...winbackEnrollments];

  if (campaign_id && typeof campaign_id === 'string') {
    list = list.filter(e => e.campaign_id === campaign_id);
  }
  if (status && typeof status === 'string' && status !== 'all') {
    list = list.filter(e => e.status === status);
  }
  if (branch_id && typeof branch_id === 'string' && branch_id !== 'all') {
    list = list.filter(e => e.branch_id === branch_id);
  }

  // Hydrate member details
  const hydrated = list.map(e => {
    const mem = members.find(m => m.id === e.member_id);
    const pred = memberChurnPredictions.find(p => p.member_id === e.member_id);
    return {
      ...e,
      member: mem,
      prediction: pred
    };
  });

  if (search && typeof search === 'string') {
    const q = search.toLowerCase().trim();
    return res.json(
      hydrated.filter(e =>
        e.member?.full_name.toLowerCase().includes(q) ||
        e.member?.phone.includes(q) ||
        e.member?.email?.toLowerCase().includes(q)
      )
    );
  }

  hydrated.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
  res.json(hydrated);
});

// 5. Winback Attempts Log
app.get('/api/winback/attempts', (req, res) => {
  const { member_id, channel, status } = req.query;
  let list = [...winbackAttempts];

  if (member_id && typeof member_id === 'string') {
    list = list.filter(a => a.member_id === member_id);
  }
  if (channel && typeof channel === 'string' && channel !== 'all') {
    list = list.filter(a => a.channel === channel);
  }
  if (status && typeof status === 'string' && status !== 'all') {
    list = list.filter(a => a.status === status);
  }

  list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json(list);
});

// 6. Manual Enroll Member
app.post('/api/winback/enroll', (req, res) => {
  const { member_id, campaign_id } = req.body;
  const mem = members.find(m => m.id === member_id);
  if (!mem) return res.status(404).json({ error: 'Member not found' });

  const camp = winbackCampaigns.find(c => c.id === campaign_id) || winbackCampaigns[0];
  if (!camp) return res.status(404).json({ error: 'Campaign not found' });

  let existing = winbackEnrollments.find(e => e.campaign_id === camp.id && e.member_id === mem.id);
  const pred = computeChurnProbability(mem.id);

  if (existing) {
    if (existing.status === 'exhausted' || existing.status === 'failed') {
      existing.status = 'enrolled';
      existing.attempt_count = 0;
      existing.updated_at = new Date().toISOString();
    }
    return res.json({ success: true, enrollment: existing, note: 'Existing enrollment reactivated' });
  }

  const newEnrollment: WinbackEnrollment = {
    id: `enr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    campaign_id: camp.id,
    campaign_name: camp.name,
    member_id: mem.id,
    branch_id: mem.branch_id,
    branch_name: mem.branch_name,
    status: 'enrolled',
    attempt_count: 0,
    churn_probability: pred.probability,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  winbackEnrollments.unshift(newEnrollment);
  res.status(201).json({ success: true, enrollment: newEnrollment });
});

// 7. Orchestrated Campaign Execution Engine (Daily Cron & On-Demand Run)
app.post('/api/winback/run', (req, res) => {
  const { campaign_id, force_bypass_silence } = req.body;
  const camp = winbackCampaigns.find(c => c.id === campaign_id) || winbackCampaigns[0];
  if (!camp || !camp.is_active) {
    return res.status(400).json({ error: 'Active campaign not found' });
  }

  // Refresh latest predictions first
  refreshChurnPredictions();

  const isSilence = inSilenceHoursIST() && !force_bypass_silence;
  let enrolledNew = 0;
  let sentCount = 0;
  let skippedSilenceCount = 0;
  let suppressedCount = 0;
  let exhaustedCount = 0;
  const errors: string[] = [];

  // Step 1: Auto-enroll any active member meeting the churn probability threshold
  const eligiblePredictions = memberChurnPredictions.filter(p => p.churn_probability >= camp.min_probability);
  for (const pred of eligiblePredictions) {
    const existing = winbackEnrollments.find(e => e.campaign_id === camp.id && e.member_id === pred.member_id);
    if (!existing) {
      const mem = members.find(m => m.id === pred.member_id);
      if (mem && mem.status === 'active' && !mem.is_archived) {
        winbackEnrollments.unshift({
          id: `enr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          campaign_id: camp.id,
          campaign_name: camp.name,
          member_id: mem.id,
          branch_id: pred.branch_id || mem.branch_id,
          branch_name: pred.branch_name || mem.branch_name,
          status: 'enrolled',
          attempt_count: 0,
          churn_probability: pred.churn_probability,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        enrolledNew++;
      }
    }
  }

  // Step 2: Target actionable enrollments
  const nowMs = Date.now();
  const cooldownMs = (camp.cooldown_hours || 48) * 3600 * 1000;
  const actionable = winbackEnrollments.filter(e => {
    if (e.campaign_id !== camp.id) return false;
    if (e.status === 'converted' || e.status === 'exhausted' || e.status === 'suppressed') return false;

    // Check attempt limits
    if (e.attempt_count >= camp.max_attempts) {
      e.status = 'exhausted';
      e.updated_at = new Date().toISOString();
      exhaustedCount++;
      return false;
    }

    // Check cooldown
    if (e.last_attempt_at) {
      const lastMs = new Date(e.last_attempt_at).getTime();
      if (nowMs - lastMs < cooldownMs) {
        return false;
      }
    }

    return e.status === 'enrolled' || e.status === 'messaged' || e.status === 'failed';
  });

  for (const enrollment of actionable) {
    const mem = members.find(m => m.id === enrollment.member_id);
    if (!mem || mem.is_archived) {
      enrollment.status = 'suppressed';
      enrollment.updated_at = new Date().toISOString();
      suppressedCount++;
      continue;
    }

    const p10 = phone10(mem.phone);
    if (!p10 && !mem.email) {
      enrollment.status = 'suppressed';
      enrollment.updated_at = new Date().toISOString();
      suppressedCount++;
      continue;
    }

    // Channel selection based on campaign config
    let selectedChannel: 'whatsapp' | 'sms' | 'email' = 'whatsapp';
    if (camp.channels.includes('whatsapp') && p10) {
      selectedChannel = 'whatsapp';
    } else if (camp.channels.includes('sms') && p10) {
      selectedChannel = 'sms';
    } else if (camp.channels.includes('email') && mem.email) {
      selectedChannel = 'email';
    }

    // Silence hours guard: suppress WhatsApp & SMS between 21:00-08:00 IST (Email is permitted)
    if (isSilence && (selectedChannel === 'whatsapp' || selectedChannel === 'sms')) {
      if (camp.channels.includes('email') && mem.email) {
        selectedChannel = 'email';
      } else {
        skippedSilenceCount++;
        continue;
      }
    }

    // Compose personalized message payload
    const firstName = mem.full_name.split(' ')[0] || 'there';
    const offerText = enrollment.churn_probability >= 0.75
      ? 'We miss you on the gym floor! Enjoy 20% off your membership renewal + 2 free PT sessions this week.'
      : 'Keep your fitness momentum going at Pulse Fitness! Exclusive loyalty renewal rates are available now.';

    const msgBody = `Hi ${firstName}, ${offerText} Reply 'YES' or visit the front desk to claim.`;

    try {
      const attemptId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const providerId = selectedChannel === 'whatsapp'
        ? `wac_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        : selectedChannel === 'sms'
          ? `msg91_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
          : `resend_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      winbackAttempts.unshift({
        id: attemptId,
        enrollment_id: enrollment.id,
        member_id: mem.id,
        member_name: mem.full_name,
        member_phone: mem.phone,
        channel: selectedChannel,
        status: 'sent',
        provider_id: providerId,
        created_at: new Date().toISOString()
      });

      enrollment.attempt_count = (enrollment.attempt_count || 0) + 1;
      enrollment.last_channel = selectedChannel;
      enrollment.last_attempt_at = new Date().toISOString();
      enrollment.status = enrollment.attempt_count >= camp.max_attempts ? 'exhausted' : 'messaged';
      enrollment.updated_at = new Date().toISOString();

      // Log in CRM activities
      crmActivities.unshift({
        id: `crm_${Date.now()}_${mem.id}`,
        member_id: mem.id,
        branch_id: mem.branch_id,
        type: 'whatsapp_sent',
        title: `🎯 Win-Back Campaign Outreach (${selectedChannel.toUpperCase()}) [Touch ${enrollment.attempt_count}/${camp.max_attempts}]`,
        description: `Automated win-back touch sent to ${mem.full_name} (${(enrollment.churn_probability * 100).toFixed(1)}% churn risk). Ref: ${providerId}`,
        actor_name: 'Winback Automation Engine',
        created_at: new Date().toISOString()
      });

      sentCount++;
    } catch (err: any) {
      errors.push(`Failed for member ${mem.id}: ${err.message || 'Dispatch error'}`);
      winbackAttempts.unshift({
        id: `att_err_${Date.now()}_${mem.id}`,
        enrollment_id: enrollment.id,
        member_id: mem.id,
        member_name: mem.full_name,
        member_phone: mem.phone,
        channel: selectedChannel,
        status: 'failed',
        error_message: err.message || 'Dispatch error',
        created_at: new Date().toISOString()
      });
      enrollment.status = 'failed';
      enrollment.updated_at = new Date().toISOString();
    }
  }

  res.json({
    success: true,
    campaign_id: camp.id,
    campaign_name: camp.name,
    examined_active: actionable.length,
    enrolled_new: enrolledNew,
    sent: sentCount,
    skipped_silence_hours: skippedSilenceCount,
    suppressed: suppressedCount,
    exhausted: exhaustedCount,
    is_silence_hours: isSilence,
    errors,
    executed_at: new Date().toISOString()
  });
});

// Payment History per member
app.get('/api/members/:id/payments', (req, res) => {
  const { id } = req.params;
  const history = paymentHistory
    .filter(p => p.member_id === id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json(history);
});

// ==========================================
// PHASE 3 NEW REST ENDPOINTS
// ==========================================

// 1. Branches API
app.get('/api/branches', (req, res) => {
  res.json(branches);
});

app.post('/api/branches', (req, res) => {
  const { name, code, city, address, phone, email, gst_number } = req.body;
  if (!name || !code || !city || !address || !phone) {
    return res.status(400).json({ error: 'Branch name, code, city, address, and phone are required.' });
  }

  const existingCode = branches.find(b => b.code.toLowerCase() === code.trim().toLowerCase());
  if (existingCode) {
    return res.status(400).json({ error: 'Branch code must be unique.' });
  }

  const newBranch: Branch = {
    id: `br_${Date.now()}`,
    name: name.trim(),
    code: code.trim().toUpperCase(),
    city: city.trim(),
    address: address.trim(),
    phone: phone.trim(),
    email: email ? email.trim() : undefined,
    gst_number: gst_number ? gst_number.trim() : undefined,
    is_active: true,
    created_at: new Date().toISOString()
  };

  branches.push(newBranch);

  // Log audit
  auditLogs.unshift({
    id: `aud_${Date.now()}`,
    user_id: 'usr_super_1',
    user_name: 'Super Owner',
    user_role: 'super_owner',
    action: 'BRANCH_CREATED',
    entity_type: 'branch',
    entity_id: newBranch.id,
    new_value: newBranch,
    created_at: new Date().toISOString()
  });

  res.status(201).json(newBranch);
});

app.put('/api/branches/:id', (req, res) => {
  const { id } = req.params;
  const branch = branches.find(b => b.id === id);
  if (!branch) {
    return res.status(404).json({ error: 'Branch not found' });
  }

  const { name, city, address, phone, email, gst_number, is_active } = req.body;
  if (name) branch.name = name;
  if (city) branch.city = city;
  if (address) branch.address = address;
  if (phone) branch.phone = phone;
  if (email !== undefined) branch.email = email;
  if (gst_number !== undefined) branch.gst_number = gst_number;
  if (is_active !== undefined) branch.is_active = is_active;

  res.json(branch);
});

// Secure Branch SMS / MSG91 Configuration (Supabase Vault Pattern & Key Rotation)
app.get('/api/branches/:id/sms-config', (req, res) => {
  const { id } = req.params;
  const cfg = branchSmsConfigs[id];
  res.json({
    branch_id: id,
    is_configured: cfg?.is_configured || false,
    msg91_last4: cfg?.msg91_last4 || null,
    previous_msg91_last4: cfg?.previous_msg91_last4 || null,
    has_previous_key: Boolean(cfg?.previous_vault_secret_id),
    rotation_started_at: cfg?.rotation_started_at || null,
    key_created_at: cfg?.key_created_at || null,
    key_last_verified_at: cfg?.key_last_verified_at || null,
    key_last_error: cfg?.key_last_error || null,
    rotation_due_at: cfg?.rotation_due_at || null,
    auto_retire_previous_after: cfg?.auto_retire_previous_after || null,
    msg91_sender_id: cfg?.msg91_sender_id || 'PULSEF',
    msg91_template_id: cfg?.msg91_template_id || null,
    updated_at: cfg?.updated_at || null
  });
});

app.post('/api/branches/:id/sms-config', (req, res) => {
  const { id } = req.params;
  const { msg91_auth_key, msg91_sender_id, msg91_template_id, updated_by } = req.body;

  const branch = branches.find(b => b.id === id);
  if (!branch) {
    return res.status(404).json({ error: 'Branch not found', code: 'FORBIDDEN_BRANCH' });
  }

  const key = String(msg91_auth_key || '').trim();
  if (!key || key.length < 8) {
    return res.status(400).json({ error: 'Invalid MSG91 auth key (minimum 8 characters)', code: 'INVALID_MSG91_KEY' });
  }

  const last4 = key.slice(-4);
  const vaultSecretId = `vsec_${id}_${Date.now()}`;
  vault.put(vaultSecretId, key);
  const vaultSecretName = `msg91_branch_${id}_${Date.now()}`;
  const existing = branchSmsConfigs[id];

  if (!existing || !existing.is_configured) {
    branchSmsConfigs[id] = {
      branch_id: id,
      vault_secret_id: vaultSecretId,
      vault_secret_name: vaultSecretName,
      previous_vault_secret_id: null,
      previous_vault_secret_name: null,
      previous_msg91_last4: null,
      rotation_started_at: null,
      key_created_at: new Date().toISOString(),
      key_last_verified_at: null,
      key_last_error: null,
      rotation_due_at: new Date(Date.now() + 90 * 86400000).toISOString(),
      auto_retire_previous_after: null,
      msg91_sender_id: msg91_sender_id ? String(msg91_sender_id).trim() : 'PULSEF',
      msg91_template_id: msg91_template_id ? String(msg91_template_id).trim() : undefined,
      msg91_last4: last4,
      is_configured: true,
      updated_at: new Date().toISOString(),
      updated_by: updated_by || 'usr_super_1'
    };

    branchRotationLogs.unshift({
      id: `rot_log_${Date.now()}`,
      branch_id: id,
      action: 'create',
      actor_id: updated_by || 'usr_super_1',
      new_last4: last4,
      created_at: new Date().toISOString()
    });
  } else {
    // Rotation path: Move current key to previous standby
    branchSmsConfigs[id] = {
      ...existing,
      previous_vault_secret_id: existing.vault_secret_id,
      previous_vault_secret_name: existing.vault_secret_name,
      previous_msg91_last4: existing.msg91_last4,
      vault_secret_id: vaultSecretId,
      vault_secret_name: vaultSecretName,
      msg91_last4: last4,
      msg91_sender_id: msg91_sender_id ? String(msg91_sender_id).trim() : existing.msg91_sender_id,
      msg91_template_id: msg91_template_id ? String(msg91_template_id).trim() : existing.msg91_template_id,
      rotation_started_at: new Date().toISOString(),
      key_created_at: new Date().toISOString(),
      key_last_verified_at: null,
      key_last_error: null,
      rotation_due_at: new Date(Date.now() + 90 * 86400000).toISOString(),
      auto_retire_previous_after: new Date(Date.now() + 7 * 86400000).toISOString(),
      is_configured: true,
      updated_at: new Date().toISOString(),
      updated_by: updated_by || 'usr_super_1'
    };

    branchRotationLogs.unshift({
      id: `rot_log_${Date.now()}`,
      branch_id: id,
      action: 'rotate',
      actor_id: updated_by || 'usr_super_1',
      new_last4: last4,
      old_last4: existing.msg91_last4,
      created_at: new Date().toISOString()
    });
  }

  // Audit log (never log raw secret)
  auditLogs.unshift({
    id: `aud_${Date.now()}`,
    user_id: updated_by || 'usr_super_1',
    user_name: 'Management',
    user_role: 'owner',
    action: 'BRANCH_SMS_CONFIG_SAVED',
    entity_type: 'branch_secrets',
    entity_id: id,
    new_value: { msg91_last4: last4, sender_id: msg91_sender_id, vault_secret_id: vaultSecretId },
    branch_id: id,
    created_at: new Date().toISOString()
  });

  res.json({
    ok: true,
    branch_id: id,
    msg91_last4: last4,
    previous_last4: branchSmsConfigs[id].previous_msg91_last4 || null,
    is_configured: true,
    rotation_pending_retire: Boolean(branchSmsConfigs[id].previous_vault_secret_id)
  });
});

// Retire previous vault secret
app.post('/api/branches/:id/sms-config/retire-previous', (req, res) => {
  const { id } = req.params;
  const { retired_by } = req.body;

  const cfg = branchSmsConfigs[id];
  if (!cfg || !cfg.previous_vault_secret_id) {
    return res.json({ ok: true, retired: false, message: 'No previous key on standby' });
  }

  const oldLast4 = cfg.previous_msg91_last4;
  vault.remove(cfg.previous_vault_secret_id);
  cfg.previous_vault_secret_id = null;
  cfg.previous_vault_secret_name = null;
  cfg.previous_msg91_last4 = null;
  cfg.rotation_started_at = null;
  cfg.auto_retire_previous_after = null;
  cfg.updated_at = new Date().toISOString();
  cfg.updated_by = retired_by || 'usr_super_1';

  branchRotationLogs.unshift({
    id: `rot_log_${Date.now()}`,
    branch_id: id,
    action: 'retire_previous',
    actor_id: retired_by || 'usr_super_1',
    old_last4: oldLast4 || undefined,
    created_at: new Date().toISOString()
  });

  auditLogs.unshift({
    id: `aud_${Date.now()}`,
    user_id: retired_by || 'usr_super_1',
    user_name: 'Management',
    user_role: 'owner',
    action: 'PREVIOUS_VAULT_SECRET_RETIRED',
    entity_type: 'branch_secrets',
    entity_id: id,
    created_at: new Date().toISOString()
  });

  res.json({ ok: true, retired: true, branch_id: id });
});

// Test SMS dispatch with verification update & retry simulation
app.post('/api/branches/:id/sms-config/test-sms', (req, res) => {
  const { id } = req.params;
  const { phone, template_id, purpose, message } = req.body;

  const cfg = branchSmsConfigs[id];
  if (!cfg || !cfg.is_configured) {
    return res.status(400).json({ error: 'SMS not configured for this branch', code: 'MSG91_NOT_CONFIGURED' });
  }

  const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
  if (cleanPhone.length !== 10) {
    return res.status(400).json({ error: 'Phone must be a valid 10-digit number', code: 'VALIDATION' });
  }

  // Simulate verification success
  cfg.key_last_verified_at = new Date().toISOString();
  cfg.key_last_error = null;

  res.json({
    ok: true,
    provider_id: `msg91_req_${Date.now()}`,
    phone: `+91${cleanPhone}`,
    status: 'sent',
    verified_at: cfg.key_last_verified_at,
    last4: cfg.msg91_last4
  });
});

// Rotation Logs per branch
app.get('/api/branches/:id/rotation-logs', (req, res) => {
  const { id } = req.params;
  const logs = branchRotationLogs.filter(l => l.branch_id === id);
  res.json({ logs });
});

// DLT Templates CRUD APIs
app.get('/api/dlt-templates', (req, res) => {
  const { branch_id, purpose } = req.query;
  let filtered = [...msg91DltTemplates];
  if (branch_id && branch_id !== 'all') {
    filtered = filtered.filter(t => t.branch_id === branch_id || t.branch_id === null);
  }
  if (purpose) {
    filtered = filtered.filter(t => t.purpose === purpose);
  }
  res.json({ templates: filtered });
});

app.post('/api/dlt-templates', (req, res) => {
  const { branch_id, name, purpose, msg91_template_id, sender_id, variable_schema, sample_body } = req.body;

  if (!name || !purpose || !msg91_template_id) {
    return res.status(400).json({ error: 'Name, purpose, and MSG91 template ID are required', code: 'VALIDATION' });
  }

  const newTpl: Msg91DltTemplate = {
    id: `dlt_tpl_${Date.now()}`,
    branch_id: branch_id || null,
    name: name.trim(),
    purpose,
    msg91_template_id: msg91_template_id.trim(),
    sender_id: sender_id ? sender_id.trim().toUpperCase() : 'PULSEF',
    variable_schema: Array.isArray(variable_schema) ? variable_schema : [],
    sample_body: sample_body ? sample_body.trim() : null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  msg91DltTemplates.push(newTpl);
  res.status(201).json(newTpl);
});

app.put('/api/dlt-templates/:id', (req, res) => {
  const { id } = req.params;
  const tpl = msg91DltTemplates.find(t => t.id === id);
  if (!tpl) {
    return res.status(404).json({ error: 'DLT template not found', code: 'DLT_TEMPLATE_MISSING' });
  }

  const { name, msg91_template_id, sender_id, variable_schema, sample_body, is_active } = req.body;
  if (name !== undefined) tpl.name = name.trim();
  if (msg91_template_id !== undefined) tpl.msg91_template_id = msg91_template_id.trim();
  if (sender_id !== undefined) tpl.sender_id = sender_id ? sender_id.trim().toUpperCase() : null;
  if (variable_schema !== undefined) tpl.variable_schema = variable_schema;
  if (sample_body !== undefined) tpl.sample_body = sample_body;
  if (is_active !== undefined) tpl.is_active = is_active;
  tpl.updated_at = new Date().toISOString();

  res.json(tpl);
});

app.delete('/api/dlt-templates/:id', (req, res) => {
  const { id } = req.params;
  const tpl = msg91DltTemplates.find(t => t.id === id);
  if (!tpl) {
    return res.status(404).json({ error: 'DLT template not found' });
  }
  // Soft deactivate instead of hard delete
  tpl.is_active = false;
  tpl.updated_at = new Date().toISOString();
  res.json({ ok: true, deactivated: true, id });
});

// Generic RPC Endpoint Dispatcher
app.post('/api/rpc/:fn', (req, res) => {
  const { fn } = req.params;
  const body = req.body || {};

  switch (fn) {
    case 'staff_check_in': {
      const { p_staff_id, p_branch_id, p_method, p_notes, p_actor_id } = body;
      const targetId = p_staff_id || body.staff_id || 'usr_trainer_1';
      const staffProf = profiles.find(p => p.id === targetId);
      const targetBranchId = p_branch_id || staffProf?.branch_id || 'br_nag_1';

      // One open shift per staff rule
      const existingOpen = staffAttendanceLogs.find(s => s.staff_id === targetId && !s.checked_out_at);
      if (existingOpen) {
        return res.status(400).json({
          error: 'Staff member is already checked in with an open shift. Please check out first.',
          code: 'ALREADY_CHECKED_IN'
        });
      }

      const newId = `stf_att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const nowIso = new Date().toISOString();
      const rec: StaffAttendanceRecord = {
        id: newId,
        staff_id: targetId,
        branch_id: targetBranchId,
        checked_in_at: nowIso,
        checked_out_at: null,
        method: p_method || 'manual',
        notes: p_notes || null,
        recorded_by: p_actor_id || targetId,
        created_at: nowIso
      };

      staffAttendanceLogs.unshift(rec);
      return res.json({
        id: newId,
        staff_id: targetId,
        branch_id: targetBranchId,
        checked_in_at: nowIso
      });
    }

    case 'staff_check_out': {
      const { p_staff_id, p_notes } = body;
      const targetId = p_staff_id || body.staff_id || 'usr_trainer_1';
      const openShift = staffAttendanceLogs.find(s => s.staff_id === targetId && !s.checked_out_at);
      if (!openShift) {
        return res.status(400).json({
          error: 'No active open shift found for this staff member.',
          code: 'NO_OPEN_SHIFT'
        });
      }

      const nowIso = new Date().toISOString();
      openShift.checked_out_at = nowIso;
      if (p_notes) {
        openShift.notes = openShift.notes ? `${openShift.notes} | ${p_notes}` : p_notes;
      }

      return res.json({
        id: openShift.id,
        staff_id: targetId,
        checked_in_at: openShift.checked_in_at,
        checked_out_at: nowIso
      });
    }

    case 'rotate_branch_msg91_secret': {
      const { p_branch_id, p_new_auth_key, p_sender_id } = body;
      const branch = branches.find(b => b.id === p_branch_id);
      if (!branch) return res.status(404).json({ error: 'Branch not found', code: 'FORBIDDEN_BRANCH' });
      if (!p_new_auth_key || p_new_auth_key.length < 8) {
        return res.status(400).json({ error: 'Invalid key length', code: 'INVALID_MSG91_KEY' });
      }
      const last4 = p_new_auth_key.slice(-4);
      const rpcVaultId = `vsec_${p_branch_id}_${Date.now()}`;
      vault.put(rpcVaultId, String(p_new_auth_key));
      const existing = branchSmsConfigs[p_branch_id];
      branchSmsConfigs[p_branch_id] = {
        ...existing,
        branch_id: p_branch_id,
        previous_vault_secret_id: existing?.vault_secret_id || null,
        previous_vault_secret_name: existing?.vault_secret_name || null,
        previous_msg91_last4: existing?.msg91_last4 || null,
        vault_secret_id: rpcVaultId,
        vault_secret_name: `msg91_branch_${p_branch_id}_${Date.now()}`,
        msg91_last4: last4,
        msg91_sender_id: p_sender_id || existing?.msg91_sender_id || 'PULSEF',
        rotation_started_at: new Date().toISOString(),
        key_created_at: new Date().toISOString(),
        key_last_verified_at: null,
        key_last_error: null,
        rotation_due_at: new Date(Date.now() + 90 * 86400000).toISOString(),
        auto_retire_previous_after: new Date(Date.now() + 7 * 86400000).toISOString(),
        is_configured: true,
        updated_at: new Date().toISOString(),
      };
      branchRotationLogs.unshift({
        id: `rot_log_${Date.now()}`,
        branch_id: p_branch_id,
        action: 'rotate',
        new_last4: last4,
        old_last4: existing?.msg91_last4,
        created_at: new Date().toISOString()
      });
      return res.json({
        ok: true,
        msg91_last4: last4,
        previous_last4: existing?.msg91_last4 || null,
        rotation_pending_retire: Boolean(existing?.vault_secret_id)
      });
    }

    case 'retire_previous_msg91_secret': {
      const { p_branch_id } = body;
      const cfg = branchSmsConfigs[p_branch_id];
      if (!cfg || !cfg.previous_vault_secret_id) {
        return res.json({ ok: true, retired: false });
      }
      const oldLast4 = cfg.previous_msg91_last4;
      cfg.previous_vault_secret_id = null;
      cfg.previous_vault_secret_name = null;
      cfg.previous_msg91_last4 = null;
      cfg.rotation_started_at = null;
      cfg.auto_retire_previous_after = null;
      cfg.updated_at = new Date().toISOString();
      branchRotationLogs.unshift({
        id: `rot_log_${Date.now()}`,
        branch_id: p_branch_id,
        action: 'retire_previous',
        old_last4: oldLast4 || undefined,
        created_at: new Date().toISOString()
      });
      return res.json({ ok: true, retired: true });
    }

    case 'run_msg91_rotation_maintenance': {
      let retired = 0;
      let due_count = 0;
      const now = Date.now();
      for (const [bid, cfg] of Object.entries(branchSmsConfigs)) {
        if (cfg.previous_vault_secret_id && cfg.auto_retire_previous_after && new Date(cfg.auto_retire_previous_after).getTime() < now) {
          cfg.previous_vault_secret_id = null;
          cfg.previous_vault_secret_name = null;
          cfg.previous_msg91_last4 = null;
          cfg.rotation_started_at = null;
          cfg.auto_retire_previous_after = null;
          retired++;
        }
        if (cfg.is_configured && cfg.rotation_due_at && new Date(cfg.rotation_due_at).getTime() <= now + 14 * 86400000) {
          due_count++;
        }
      }
      return res.json({ retired_previous: retired, rotation_due_soon: due_count, ran_at: new Date().toISOString() });
    }

    case 'resolve_dlt_template': {
      const { p_branch_id, p_purpose } = body;
      const t = msg91DltTemplates.find(tpl => tpl.is_active && tpl.purpose === p_purpose && (tpl.branch_id === p_branch_id || tpl.branch_id === null));
      if (!t) return res.status(404).json({ error: 'No template found', code: 'DLT_TEMPLATE_MISSING' });
      return res.json({
        id: t.id,
        msg91_template_id: t.msg91_template_id,
        sender_id: t.sender_id,
        variable_schema: t.variable_schema,
        name: t.name
      });
    }

    case 'list_balance_reminder_targets': {
      const p_branch_id = body.p_branch_id;
      const p_min_balance = body.p_min_balance !== undefined ? Number(body.p_min_balance) : 1;
      const p_cooldown_days = body.p_cooldown_days !== undefined ? Number(body.p_cooldown_days) : 3;

      const now = Date.now();
      const todayStr = getTodayStr();
      const cooldownMs = p_cooldown_days * 86400000;

      const targets: BalanceReminderTarget[] = [];
      for (const m of members) {
        if (m.is_archived) continue;
        if (p_branch_id && p_branch_id !== 'all' && m.branch_id !== p_branch_id) continue;
        const bal = Number(m.balance_due) || 0;
        if (bal < p_min_balance) continue;

        const p10 = phone10(m.phone);
        if (!p10) continue;

        // Check promise to pay & cooldown from balanceReminderLogs
        const logs = balanceReminderLogs.filter(l => l.member_id === m.id);
        const sentLogs = logs.filter(l => l.status === 'sent');
        
        let lastSentAt: string | null = null;
        if (sentLogs.length > 0) {
          const latest = sentLogs.reduce((prev, curr) => 
            new Date(curr.created_at).getTime() > new Date(prev.created_at).getTime() ? curr : prev
          );
          lastSentAt = latest.created_at;
          if (now - new Date(lastSentAt).getTime() < cooldownMs) {
            continue; // still in cooldown
          }
        }

        // Check active future promised_date
        const promiseLogs = logs.filter(l => l.promised_date && l.promised_date >= todayStr);
        let activePromiseDate: string | null = null;
        if (promiseLogs.length > 0) {
          const latestPromise = promiseLogs.reduce((prev, curr) => 
            new Date(curr.created_at).getTime() > new Date(prev.created_at).getTime() ? curr : prev
          );
          activePromiseDate = latestPromise.promised_date || null;
          // Pauses reminders until promised date
          if (activePromiseDate && activePromiseDate > todayStr) {
            continue;
          }
        }

        // Calculate days overdue
        let daysOverdue = 0;
        if (m.start_date) {
          const startDateMs = new Date(m.start_date).getTime();
          daysOverdue = Math.max(0, Math.floor((now - startDateMs) / 86400000));
        }

        const branch = branches.find(b => b.id === m.branch_id);

        targets.push({
          member_id: m.id,
          full_name: m.full_name,
          phone: m.phone,
          balance_due: bal,
          branch_id: m.branch_id,
          branch_name: branch?.name || m.branch_name,
          last_payment_date: m.start_date || m.created_at,
          days_overdue: daysOverdue,
          last_reminder_at: lastSentAt || undefined,
          promised_date: activePromiseDate || undefined,
          package_type: m.package_type,
          status: m.status
        });
      }

      targets.sort((a, b) => b.balance_due - a.balance_due);
      return res.json(targets);
    }

    case 'sales_totals': {
      const { p_branch_id, p_day } = body;
      const targetDay = p_day || getTodayStr();

      // Calculate start of week (Monday) and start of month
      const d = new Date(targetDay);
      const dayOfWeek = d.getDay(); // 0 is Sun, 1 is Mon...
      const diffToMon = (dayOfWeek + 6) % 7; // days since Mon
      const startOfWeek = new Date(d);
      startOfWeek.setDate(d.getDate() - diffToMon);
      const startOfWeekStr = startOfWeek.toISOString().slice(0, 10);

      const startOfMonthStr = `${targetDay.slice(0, 7)}-01`;

      let relevantPayments = paymentHistory.filter(p => {
        const pMethod = String(p.payment_method || '').toLowerCase();
        if (pMethod === 'adjusted' || p.entry_type === 'freeze') return false;
        if (p_branch_id && p_branch_id !== 'all' && p.branch_id !== p_branch_id) return false;
        return true;
      });

      let dayTotal = 0;
      let weekTotal = 0;
      let monthTotal = 0;

      for (const p of relevantPayments) {
        const pDate = p.entry_date || p.created_at.slice(0, 10);
        const amt = Number(p.amount) || 0;
        if (pDate === targetDay) {
          dayTotal += amt;
        }
        if (pDate >= startOfWeekStr && pDate <= targetDay) {
          weekTotal += amt;
        }
        if (pDate >= startOfMonthStr && pDate <= targetDay) {
          monthTotal += amt;
        }
      }

      return res.json({
        day: dayTotal,
        week: weekTotal,
        month: monthTotal
      });
    }

    case 'shift_close_totals': {
      const { p_branch_id, p_day } = body;
      const targetDay = p_day || getTodayStr();

      let dayPayments = paymentHistory.filter(p => {
        const pDate = p.entry_date || p.created_at.slice(0, 10);
        if (pDate !== targetDay) return false;
        if (p_branch_id && p_branch_id !== 'all' && p.branch_id !== p_branch_id) return false;
        return true;
      });

      let upi = 0;
      let cash = 0;
      let card = 0;
      let bank_transfer = 0;
      let adjusted = 0;
      let nCount = 0;
      let rCount = 0;
      let bCount = 0;
      let fCount = 0;

      for (const p of dayPayments) {
        const amt = Number(p.amount) || 0;
        const method = String(p.payment_method || '').toLowerCase();
        const eType = p.entry_type;

        if (eType === 'new') nCount++;
        else if (eType === 'renewal') rCount++;
        else if (eType === 'balance') bCount++;
        else if (eType === 'freeze') fCount++;

        if (method.includes('upi') || method.includes('gpay') || method.includes('phonepe') || method.includes('bhim')) {
          upi += amt;
        } else if (method.includes('cash')) {
          cash += amt;
        } else if (method.includes('card') || method.includes('pos')) {
          card += amt;
        } else if (method.includes('bank') || method.includes('neft') || method.includes('imps')) {
          bank_transfer += amt;
        } else if (method.includes('adjust') || eType === 'freeze') {
          adjusted += amt;
        } else {
          upi += amt;
        }
      }

      const total = upi + cash + card + bank_transfer;

      return res.json({
        day: targetDay,
        upi,
        cash,
        card,
        bank_transfer,
        adjusted,
        total,
        n_count: nCount,
        r_count: rCount,
        b_count: bCount,
        f_count: fCount
      });
    }

    case 'check_in_with_override': {
      const { p_member_id, p_notes, p_promise_preset, p_actor_id } = body;
      if (!p_member_id) return res.status(400).json({ error: 'p_member_id is required' });

      const targetMember = members.find(m => m.id === p_member_id);
      if (!targetMember) return res.status(404).json({ error: 'Member not found', code: 'MEMBER_NOT_FOUND' });

      const todayStr = getTodayStr();
      const existingToday = attendanceLogs.find(a => a.member_id === p_member_id && a.checked_in_at.slice(0, 10) === todayStr);
      if (existingToday) {
        return res.status(409).json({ error: 'Already checked in today', code: 'ALREADY_CHECKED_IN' });
      }

      const checker = profiles.find(p => p.id === p_actor_id) || profiles[0];

      const attRecord: AttendanceRecord = {
        id: `att_ovr_${Date.now()}`,
        member_id: p_member_id,
        member_name: targetMember.full_name,
        member_package: targetMember.package_type,
        checked_in_at: new Date().toISOString(),
        checked_in_by: checker.id,
        checked_in_by_name: checker.full_name,
        branch_id: targetMember.branch_id,
        branch_name: targetMember.branch_name,
        method: 'manual_override',
        notes: p_notes || 'Front-Desk Soft Override Entry'
      };
      attendanceLogs.unshift(attRecord);

      let promiseDate: string | null = null;
      if (Number(targetMember.balance_due) > 0 && p_promise_preset) {
        const d = new Date();
        if (p_promise_preset === 'tomorrow') d.setDate(d.getDate() + 1);
        else if (p_promise_preset === '3d') d.setDate(d.getDate() + 3);
        else if (p_promise_preset === 'next_week') d.setDate(d.getDate() + 7);
        else d.setDate(d.getDate() + 1);
        promiseDate = d.toISOString().slice(0, 10);

        balanceReminderLogs.unshift({
          id: `brem_ovr_${Date.now()}`,
          member_id: targetMember.id,
          branch_id: targetMember.branch_id,
          balance_due: targetMember.balance_due,
          channel: 'call',
          status: 'sent',
          outcome: 'promised',
          promised_date: promiseDate,
          error_message: `Check-in Override Promise: ${p_notes || ''}`,
          created_at: new Date().toISOString()
        });
      }

      return res.json({
        attendance_id: attRecord.id,
        member_id: p_member_id,
        promised_date: promiseDate,
        balance_due: targetMember.balance_due,
        record: attRecord
      });
    }

    case 'register_day_entry': {
      const {
        p_entry_type,
        p_full_name,
        p_phone,
        p_gender,
        p_months,
        p_freeze_days,
        p_amount,
        p_method,
        p_list_price,
        p_branch_id,
        p_notes,
        p_idempotency_key
      } = body;

      // 1. Idempotency check
      if (p_idempotency_key) {
        const existingPay = paymentHistory.find(p => p.idempotency_key === p_idempotency_key);
        if (existingPay) {
          const mem = members.find(m => m.id === existingPay.member_id);
          return res.json({
            member_id: existingPay.member_id,
            payment_id: existingPay.id,
            entry_type: existingPay.entry_type || p_entry_type,
            balance_due: mem ? mem.balance_due : 0,
            end_date: mem ? mem.end_date : null,
            replayed: true
          });
        }
      }

      // 2. Validate entry_type
      if (!['new', 'renewal', 'balance', 'freeze'].includes(p_entry_type)) {
        return res.status(400).json({ error: "entry_type must be 'new', 'renewal', 'balance', or 'freeze'", code: 'VALIDATION' });
      }

      const cleanPhone = phone10(p_phone);
      if (!cleanPhone) {
        return res.status(400).json({ error: 'Valid 10-digit Indian phone number required', code: 'INVALID_PHONE' });
      }

      const branchId = p_branch_id || 'br_nag_1';
      const branch = branches.find(b => b.id === branchId) || branches[0];
      const todayStr = getTodayStr();
      const amount = p_entry_type === 'freeze' ? 0 : Math.max(0, Number(p_amount) || 0);
      const listPrice = p_list_price !== undefined && p_list_price !== '' ? Math.max(0, Number(p_list_price)) : null;
      const months = Math.max(1, Number(p_months) || 1);
      // Freeze length is FIXED at exactly 30 days (1 month) for annual members
      const freezeDays = p_entry_type === 'freeze' ? 30 : Math.max(1, Math.min(90, Number(p_freeze_days) || 15));

      let targetMember: Member | undefined;
      // Find member by phone in this branch (or org-wide fallback)
      targetMember = members.find(m => phone10(m.phone) === cleanPhone && m.branch_id === branchId && !m.is_archived);
      if (!targetMember) {
        targetMember = members.find(m => phone10(m.phone) === cleanPhone && !m.is_archived);
      }

      let newEndDate: string | null = null;
      let finalBalance = 0;

      if (p_entry_type === 'freeze') {
        if (!targetMember) {
          return res.status(404).json({ error: `No active member found for phone ${cleanPhone} to freeze.`, code: 'MEMBER_NOT_FOUND' });
        }

        if (targetMember.status !== 'active') {
          return res.status(400).json({
            error: 'Cannot freeze an inactive or non-member account',
            code: 'CANNOT_FREEZE_INACTIVE'
          });
        }

        if (!targetMember.end_date || targetMember.end_date < todayStr) {
          return res.status(400).json({
            error: 'Cannot freeze an expired membership — please renew instead',
            code: 'CANNOT_FREEZE_EXPIRED'
          });
        }

        // Strict Annual Member validation: 12 months or annual package name
        const subMonths = Number(targetMember.subscription_months || 0);
        const pkg = String(targetMember.package_type || '').toLowerCase();
        const isAnnual = subMonths === 12 || /annual|year|yearly|12\s*month/.test(pkg);

        if (!isAnnual) {
          return res.status(400).json({
            error: 'Membership freeze is strictly reserved for 12-month / Annual members only',
            code: 'FREEZE_ANNUAL_ONLY'
          });
        }

        const curEnd = targetMember.end_date;
        const curEndDateObj = new Date(curEnd);
        curEndDateObj.setDate(curEndDateObj.getDate() + 30);
        newEndDate = curEndDateObj.toISOString().slice(0, 10);

        targetMember.end_date = newEndDate;
        targetMember.notes = `${targetMember.notes || ''} [Frozen 30d (Annual) on ${todayStr}]`.trim();
        targetMember.updated_at = new Date().toISOString();
        finalBalance = targetMember.balance_due || 0;
      } else if (p_entry_type === 'new') {
        if (!p_full_name || !p_full_name.trim()) {
          return res.status(400).json({ error: 'Full name is required for new registration', code: 'VALIDATION' });
        }
        const computedEnd = addMonthsToDate(todayStr, months);
        newEndDate = computedEnd;
        const basePrice = listPrice !== null ? listPrice : amount;
        const computedDue = Math.max(0, basePrice - amount);
        finalBalance = computedDue;

        if (targetMember) {
          // Reactivate / update existing
          targetMember.full_name = p_full_name.trim();
          targetMember.status = 'active';
          targetMember.start_date = todayStr;
          targetMember.end_date = computedEnd;
          targetMember.subscription_months = months;
          targetMember.amount_paid = (targetMember.amount_paid || 0) + amount;
          targetMember.balance_due = computedDue;
          targetMember.updated_at = new Date().toISOString();
        } else {
          // Create new member
          const newMemId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const pkgName: PlanPackage = months >= 12 ? 'VIP Annual Membership' : 'General Gym';
          const commRate = getDefaultCommissionRate(pkgName);
          const commAmt = calculateCommissionAmount(amount, commRate);

          targetMember = {
            id: newMemId,
            full_name: p_full_name.trim(),
            phone: `+91${cleanPhone}`,
            gender: p_gender || 'Male',
            status: 'active',
            package_type: pkgName,
            subscription_months: months,
            amount_paid: amount,
            balance_due: computedDue,
            payment_method: p_method || 'UPI / GPay / PhonePe',
            start_date: todayStr,
            end_date: computedEnd,
            branch_id: branchId,
            branch_name: branch.name,
            onboarded_by: 'usr_owner_1',
            trainer_name: 'Bipin Amrutha',
            commission_rate: commRate,
            commission_amount: commAmt,
            notes: p_notes || 'Registered via Daily Accounts Log',
            is_archived: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          members.unshift(targetMember);
        }
      } else if (p_entry_type === 'renewal') {
        if (!targetMember) {
          // Auto-create or reactivate with name if provided
          if (!p_full_name || !p_full_name.trim()) {
            return res.status(404).json({ error: `No existing member found for phone ${cleanPhone}. Please register as New (N).`, code: 'MEMBER_NOT_FOUND' });
          }
          const newMemId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const computedEnd = addMonthsToDate(todayStr, months);
          newEndDate = computedEnd;
          const basePrice = listPrice !== null ? listPrice : amount;
          const computedDue = Math.max(0, basePrice - amount);
          finalBalance = computedDue;

          targetMember = {
            id: newMemId,
            full_name: p_full_name.trim(),
            phone: `+91${cleanPhone}`,
            gender: p_gender || 'Male',
            status: 'active',
            package_type: 'General Gym',
            subscription_months: months,
            amount_paid: amount,
            balance_due: computedDue,
            payment_method: p_method || 'UPI / GPay / PhonePe',
            start_date: todayStr,
            end_date: computedEnd,
            branch_id: branchId,
            branch_name: branch.name,
            onboarded_by: 'usr_owner_1',
            trainer_name: 'Bipin Amrutha',
            notes: p_notes || 'Renewal entry auto-created',
            is_archived: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          members.unshift(targetMember);
        } else {
          // Extend from existing end_date if in future, else today
          const startBase = (targetMember.end_date && targetMember.end_date >= todayStr) ? targetMember.end_date : todayStr;
          const computedEnd = addMonthsToDate(startBase, months);
          newEndDate = computedEnd;
          const basePrice = listPrice !== null ? listPrice : (targetMember.balance_due || 0) + amount;
          const computedDue = Math.max(0, basePrice - amount);
          finalBalance = computedDue;

          targetMember.status = 'active';
          targetMember.end_date = computedEnd;
          targetMember.subscription_months = (targetMember.subscription_months || 0) + months;
          targetMember.amount_paid = (targetMember.amount_paid || 0) + amount;
          targetMember.balance_due = computedDue;
          targetMember.updated_at = new Date().toISOString();
        }
      } else if (p_entry_type === 'balance') {
        if (!targetMember) {
          return res.status(404).json({ error: `No member found for phone ${cleanPhone} to clear balance.`, code: 'MEMBER_NOT_FOUND' });
        }
        const currentDue = Number(targetMember.balance_due) || 0;
        finalBalance = Math.max(0, currentDue - amount);
        targetMember.balance_due = finalBalance;
        targetMember.amount_paid = (targetMember.amount_paid || 0) + amount;
        targetMember.updated_at = new Date().toISOString();
      }

      // 3. Record Payment if amount > 0 or freeze
      let payRecord: PaymentRecord | null = null;
      if (targetMember && (amount > 0 || p_entry_type === 'freeze')) {
        const payId = `pay_reg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        payRecord = {
          id: payId,
          member_id: targetMember.id,
          amount: amount,
          payment_method: p_entry_type === 'freeze' ? 'adjusted' : (p_method || 'UPI / GPay / PhonePe'),
          entry_type: p_entry_type,
          entry_date: todayStr,
          idempotency_key: p_idempotency_key || undefined,
          list_price: listPrice || undefined,
          balance_after: finalBalance,
          branch_id: branchId,
          notes: p_entry_type === 'freeze'
            ? `Day Register [FREEZE]: Frozen ${freezeDays} days. ${p_notes || ''}`.trim()
            : p_notes ? `Day Register [${p_entry_type.toUpperCase()}]: ${p_notes}` : `Day Register [${p_entry_type.toUpperCase()}]`,
          received_by: 'usr_owner_1',
          received_by_name: 'Bipin Amrutha',
          created_at: new Date().toISOString()
        };
        paymentHistory.unshift(payRecord);

        // Commission & Winback triggers
        if (amount > 0) {
          recordCommissionSettlementOnPayment(payId, targetMember, amount, `Day Register entry [${p_entry_type}]`);
          convertWinbackEnrollmentOnPayment(targetMember.id);
          refreshChurnPredictions();
        }
      }

      // 4. CRM Activity log
      if (targetMember) {
        const typeLabel = p_entry_type === 'new' ? 'New Join (N)' : p_entry_type === 'renewal' ? 'Renewal (R)' : p_entry_type === 'balance' ? 'Balance Cleared (B)' : 'Membership Frozen (F)';
        crmActivities.unshift({
          id: `crm_day_${Date.now()}`,
          member_id: targetMember.id,
          branch_id: branchId,
          type: 'payment',
          title: `📝 Day Register: ${typeLabel}`,
          description: p_entry_type === 'freeze'
            ? `Frozen for ${freezeDays} days till ${newEndDate}. ₹0 adjusted. ${p_notes || ''}`
            : `Paid: ₹${amount.toLocaleString('en-IN')} via ${p_method || 'UPI'}. Balance remaining: ₹${finalBalance.toLocaleString('en-IN')}. ${p_notes || ''}`,
          actor_name: 'Staff / Owner',
          created_at: new Date().toISOString()
        });
      }

      return res.json({
        member_id: targetMember ? targetMember.id : '',
        payment_id: payRecord ? payRecord.id : null,
        entry_type: p_entry_type,
        balance_due: finalBalance,
        end_date: targetMember ? targetMember.end_date : newEndDate,
        freeze_days: p_entry_type === 'freeze' ? freezeDays : undefined,
        replayed: false
      });
    }

    case 'member_freeze_eligible': {
      const { p_phone, p_branch_id } = body;
      const cleanPhone = phone10(p_phone);
      if (!cleanPhone) {
        return res.json({ eligible: false, reason: 'INVALID_PHONE', message: 'Valid 10-digit Indian phone number required' });
      }
      const branchId = p_branch_id || 'br_nag_1';
      let m = members.find(mem => phone10(mem.phone) === cleanPhone && mem.branch_id === branchId && !mem.is_archived);
      if (!m) {
        m = members.find(mem => phone10(mem.phone) === cleanPhone && !mem.is_archived);
      }
      if (!m) {
        return res.json({ eligible: false, reason: 'MEMBER_NOT_FOUND', message: 'No registered member found with this phone number' });
      }

      const todayStr = getTodayStr();
      if (m.status !== 'active') {
        return res.json({
          eligible: false,
          reason: 'NOT_ACTIVE',
          member_id: m.id,
          full_name: m.full_name,
          package_type: m.package_type,
          subscription_months: m.subscription_months,
          message: 'Member account is not active'
        });
      }
      if (!m.end_date || m.end_date < todayStr) {
        return res.json({
          eligible: false,
          reason: 'EXPIRED',
          member_id: m.id,
          full_name: m.full_name,
          package_type: m.package_type,
          subscription_months: m.subscription_months,
          end_date: m.end_date,
          message: 'Membership has expired — please renew instead'
        });
      }

      const subMonths = Number(m.subscription_months || 0);
      const pkg = String(m.package_type || '').toLowerCase();
      const isAnnual = subMonths === 12 || /annual|year|yearly|12\s*month/.test(pkg);

      if (!isAnnual) {
        return res.json({
          eligible: false,
          reason: 'NOT_ANNUAL',
          member_id: m.id,
          full_name: m.full_name,
          package_type: m.package_type,
          subscription_months: m.subscription_months,
          message: `Freeze is only permitted for Annual (12-month) members. Current: ${m.package_type || `${subMonths} Months`}`
        });
      }

      const curEndObj = new Date(m.end_date);
      curEndObj.setDate(curEndObj.getDate() + 30);
      const projectedEnd = curEndObj.toISOString().slice(0, 10);

      return res.json({
        eligible: true,
        member_id: m.id,
        full_name: m.full_name,
        package_type: m.package_type,
        subscription_months: m.subscription_months,
        current_end_date: m.end_date,
        projected_end_date: projectedEnd,
        freeze_days: 30,
        message: 'Eligible for 30-day (1 Month) annual membership freeze'
      });
    }

    case 'quick_dump_contacts': {
      const { contacts, raw_text, contact, clean_suffix = true, default_branch_id = 'br_nag_1' } = body;
      let contactList: Array<{ full_name: string; phone: string; gender?: string; package_type?: string; amount_paid?: number; status?: string; notes?: string }> = [];

      if (contact && typeof contact === 'object' && contact.full_name && contact.phone) {
        contactList.push(contact);
      } else if (Array.isArray(contacts)) {
        contactList = contacts;
      } else if (typeof raw_text === 'string' && raw_text.trim()) {
        const lines = raw_text.trim().split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const phoneMatch = trimmed.match(/(?:\+?91[\s\-]?)?[6-9]\d{4}[\s\-]?\d{5}/) ||
                             trimmed.match(/(?:\+?91[\s\-]?)?\d{10,12}/);
          if (phoneMatch) {
            const rawPhone = phoneMatch[0];
            const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
            let rawName = trimmed.replace(rawPhone, '').trim();
            rawName = rawName.replace(/^[\s\-_:,()[\]]+/, '').replace(/[\s\-_:,()[\]]+$/, '').trim();
            if (cleanPhone.length === 10) {
              contactList.push({ full_name: rawName || 'Member', phone: cleanPhone });
            }
          }
        }
      }

      if (contactList.length === 0) {
        return res.status(400).json({ error: 'No valid contacts provided' });
      }

      const todayStr = getTodayStr();
      let inserted = 0;
      let skipped_duplicates = 0;
      const skipped_details: any[] = [];
      const results: any[] = [];
      const branch_summary: Record<string, number> = {
        br_nag_1: 0,
        br_bsk_3: 0,
        br_rr_2: 0,
      };

      for (const c of contactList) {
        const rawName = (c.full_name || '').trim();
        if (!rawName) continue;
        const rawPhone = String(c.phone || '').replace(/\D/g, '');
        const phone10 = rawPhone.slice(-10);
        if (!phone10 || phone10.length !== 10) continue;

        const detected = detectBranchFromContactName(rawName, default_branch_id);
        const targetBranch = branches.find(b => b.id === detected.branch_id) || branches[0];

        const existing = members.find(
          m => !m.is_archived && m.branch_id === targetBranch.id && m.phone.replace(/\D/g, '').slice(-10) === phone10
        );

        if (existing) {
          skipped_duplicates++;
          skipped_details.push({
            name: rawName,
            phone: phone10,
            branch_id: targetBranch.id,
            branch_name: targetBranch.name,
            reason: `Already exists in ${targetBranch.name}`
          });
          continue;
        }

        const finalName = clean_suffix ? (detected.cleaned_name || rawName) : rawName;
        const newId = `mem_dump_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const pkgName: PlanPackage = (c.package_type as PlanPackage) || 'General Gym';
        const commRate = getDefaultCommissionRate(pkgName);
        const amtPaid = Number(c.amount_paid) || 0;
        const commAmt = calculateCommissionAmount(amtPaid, commRate);

        const newMem: Member = {
          id: newId,
          full_name: finalName,
          phone: `+91${phone10}`,
          raw_phone: c.phone,
          gender: (c.gender as any) || 'Male',
          status: (c.status as MemberStatus) || 'active',
          package_type: pkgName,
          subscription_months: 1,
          amount_paid: amtPaid,
          balance_due: 0,
          payment_method: 'Cash',
          start_date: todayStr,
          end_date: addMonthsToDate(todayStr, 1),
          branch_id: targetBranch.id,
          branch_name: targetBranch.name,
          onboarded_by: 'usr_owner_1',
          trainer_name: 'Bipin Amrutha',
          commission_rate: commRate,
          commission_amount: commAmt,
          notes: `Smart Auto-Branch Dump: Original "${rawName}" [${detected.matched_rule}]`,
          is_archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        members.unshift(newMem);
        inserted++;
        branch_summary[targetBranch.id] = (branch_summary[targetBranch.id] || 0) + 1;
        results.push({
          id: newId,
          original_name: rawName,
          full_name: finalName,
          phone: `+91${phone10}`,
          branch_id: targetBranch.id,
          branch_name: targetBranch.name,
          matched_rule: detected.matched_rule,
          status: 'inserted'
        });
      }

      return res.json({
        success: true,
        inserted,
        skipped_duplicates,
        branch_summary,
        skipped_details,
        results
      });
    }

    case 'bulk_import_members': {
      const { p_branch_id, p_rows, clean_suffix } = body;
      if (!Array.isArray(p_rows) || p_rows.length === 0) {
        return res.status(400).json({ error: 'p_rows must be a non-empty array' });
      }

      const todayStr = getTodayStr();
      let inserted = 0;
      let skipped = 0;
      const skipped_phones: string[] = [];

      for (const r of p_rows) {
        const rawPhone = String(r.phone || '').replace(/\D/g, '');
        const phone10 = rawPhone.slice(-10);

        if (!phone10 || phone10.length !== 10) {
          continue;
        }

        const rawName = (r.full_name || 'Member').trim();
        // Determine branch: auto-routed from name if p_branch_id is 'auto' or not provided
        let targetBranchId = p_branch_id;
        let targetBranchName = '';
        let finalName = rawName;

        if (!targetBranchId || targetBranchId === 'auto') {
          const route = detectBranchFromContactName(rawName);
          targetBranchId = route.branch_id;
          targetBranchName = route.branch_name;
          if (clean_suffix !== false && route.cleaned_name) {
            finalName = route.cleaned_name;
          }
        } else {
          const bObj = branches.find(b => b.id === targetBranchId) || branches[0];
          targetBranchName = bObj.name;
        }

        const existing = members.find(
          m => !m.is_archived && m.branch_id === targetBranchId && m.phone.replace(/\D/g, '').slice(-10) === phone10
        );

        if (existing) {
          skipped++;
          skipped_phones.push(phone10);
          continue;
        }

        const months = r.months ? Number(r.months) : 1;
        const start_d = r.start_date || todayStr;
        let end_d = r.end_date;
        if (!end_d && months) {
          end_d = addMonthsToDate(start_d, months);
        }

        const newId = `mem_imp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const pkgName: PlanPackage = (r.package_type as PlanPackage) || (months >= 12 ? 'VIP Annual Membership' : 'General Gym');
        const commRate = getDefaultCommissionRate(pkgName);
        const amtPaid = Number(r.amount_paid) || 0;
        const commAmt = calculateCommissionAmount(amtPaid, commRate);

        const newMem: Member = {
          id: newId,
          full_name: finalName,
          phone: `+91${phone10}`,
          gender: r.gender || 'Male',
          age: r.age ? Number(r.age) : undefined,
          email: r.email || undefined,
          status: (r.status as MemberStatus) || 'active',
          package_type: pkgName,
          subscription_months: months,
          amount_paid: amtPaid,
          balance_due: Number(r.balance_due) || 0,
          payment_method: amtPaid > 0 ? 'UPI / GPay / PhonePe' : 'Cash',
          start_date: start_d,
          end_date: end_d || addMonthsToDate(start_d, 1),
          branch_id: targetBranchId,
          branch_name: targetBranchName,
          onboarded_by: 'usr_owner_1',
          trainer_name: 'Bipin Amrutha',
          commission_rate: commRate,
          commission_amount: commAmt,
          notes: r.notes || `Imported via Bulk Import [${targetBranchName}]`,
          is_archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        members.unshift(newMem);
        inserted++;
      }

      return res.json({
        inserted,
        skipped_duplicates: skipped,
        skipped_phones
      });
    }

    case 'bulk_import_payments': {
      const { p_branch_id, p_rows, p_update_member_period } = body;
      if (!p_branch_id) return res.status(400).json({ error: 'p_branch_id is required' });
      if (!Array.isArray(p_rows) || p_rows.length === 0) {
        return res.status(400).json({ error: 'p_rows must be a non-empty array' });
      }

      const branch = branches.find(b => b.id === p_branch_id) || branches[0];
      const todayStr = getTodayStr();
      let inserted = 0;
      let skipped_missing = 0;
      let skipped_dup = 0;
      const missing_phones: string[] = [];

      for (const r of p_rows) {
        const rawPhone = String(r.phone || '').replace(/\D/g, '');
        const phone10 = rawPhone.slice(-10);
        const amt = Number(r.amount) || 0;
        const etype = (r.entry_type || 'balance') as 'new' | 'renewal' | 'balance';
        const entry_d = r.entry_date || todayStr;
        const idemp = r.idempotency_key || null;

        if (idemp && paymentHistory.some(p => p.idempotency_key === idemp)) {
          skipped_dup++;
          continue;
        }

        const targetMember = members.find(
          m => !m.is_archived && m.branch_id === p_branch_id && m.phone.replace(/\D/g, '').slice(-10) === phone10
        );

        if (!targetMember) {
          skipped_missing++;
          missing_phones.push(phone10);
          continue;
        }

        const months = r.months ? Number(r.months) : null;
        const list_price = r.list_price !== undefined && r.list_price !== null ? Number(r.list_price) : null;

        if (etype === 'balance') {
          targetMember.balance_due = Math.max(0, (targetMember.balance_due || 0) - amt);
          targetMember.amount_paid = (targetMember.amount_paid || 0) + amt;
          targetMember.updated_at = new Date().toISOString();
        } else {
          if (p_update_member_period && months && months >= 1) {
            const curEnd = targetMember.end_date;
            let newEnd = addMonthsToDate(entry_d, months);
            if (etype === 'renewal' && curEnd && curEnd >= entry_d) {
              newEnd = addMonthsToDate(curEnd, months);
            }
            targetMember.status = 'active';
            if (etype === 'new') {
              targetMember.start_date = entry_d;
            }
            targetMember.end_date = newEnd;
            targetMember.subscription_months = months;
            targetMember.amount_paid = (targetMember.amount_paid || 0) + amt;
            if (list_price !== null) {
              targetMember.balance_due = Math.max(0, list_price - amt);
            }
            targetMember.updated_at = new Date().toISOString();
          } else {
            targetMember.amount_paid = (targetMember.amount_paid || 0) + amt;
            if (list_price !== null) {
              targetMember.balance_due = Math.max(0, list_price - amt);
            }
            targetMember.updated_at = new Date().toISOString();
          }
        }

        const payId = `pay_imp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const payRecord: PaymentRecord = {
          id: payId,
          member_id: targetMember.id,
          amount: amt,
          payment_method: r.method === 'upi' ? 'UPI / GPay / PhonePe' : r.method === 'cash' ? 'Cash' : r.method === 'card' ? 'Credit Card' : 'Bank Transfer',
          entry_type: etype,
          entry_date: entry_d,
          payment_reference: r.reference || undefined,
          idempotency_key: idemp || undefined,
          list_price: list_price !== null ? list_price : undefined,
          balance_after: targetMember.balance_due,
          branch_id: p_branch_id,
          notes: r.notes ? `Bulk Import [${etype.toUpperCase()}]: ${r.notes}` : `Bulk Import [${etype.toUpperCase()}]`,
          received_by: 'usr_owner_1',
          received_by_name: 'Bipin Amrutha',
          created_at: new Date().toISOString()
        };

        paymentHistory.unshift(payRecord);
        if (amt > 0) {
          recordCommissionSettlementOnPayment(payId, targetMember, amt, `Bulk Payment Import [${etype}]`);
        }
        inserted++;
      }

      return res.json({
        inserted,
        skipped_missing_member: skipped_missing,
        skipped_duplicates: skipped_dup,
        missing_phones
      });
    }

    default:
      return res.status(400).json({ error: `Unknown RPC function ${fn}`, code: 'UNKNOWN' });
  }
});

// Balance Reminders & Day Register Dedicated Endpoints

// GET /api/balance-reminders/targets
app.get('/api/balance-reminders/targets', (req, res) => {
  const { branch_id, min_balance, cooldown_days } = req.query;
  const minBal = min_balance !== undefined ? Number(min_balance) : 1;
  const cooldownDays = cooldown_days !== undefined ? Number(cooldown_days) : 3;

  const now = Date.now();
  const cooldownMs = cooldownDays * 86400000;

  const targets: BalanceReminderTarget[] = [];
  for (const m of members) {
    if (m.is_archived) continue;
    if (branch_id && branch_id !== 'all' && m.branch_id !== branch_id) continue;
    const bal = Number(m.balance_due) || 0;
    if (bal < minBal) continue;

    const p10 = phone10(m.phone);
    if (!p10) continue;

    const sentLogs = balanceReminderLogs.filter(l => l.member_id === m.id && l.status === 'sent');
    let lastSentAt: string | null = null;
    if (sentLogs.length > 0) {
      const latest = sentLogs.reduce((prev, curr) => 
        new Date(curr.created_at).getTime() > new Date(prev.created_at).getTime() ? curr : prev
      );
      lastSentAt = latest.created_at;
      if (now - new Date(lastSentAt).getTime() < cooldownMs) {
        continue;
      }
    }

    let daysOverdue = 0;
    if (m.start_date) {
      const startDateMs = new Date(m.start_date).getTime();
      daysOverdue = Math.max(0, Math.floor((now - startDateMs) / 86400000));
    }

    const branch = branches.find(b => b.id === m.branch_id);

    targets.push({
      member_id: m.id,
      full_name: m.full_name,
      phone: m.phone,
      balance_due: bal,
      branch_id: m.branch_id,
      branch_name: branch?.name || m.branch_name,
      last_payment_date: m.start_date || m.created_at,
      days_overdue: daysOverdue,
      last_reminder_at: lastSentAt || undefined,
      package_type: m.package_type,
      status: m.status
    });
  }

  targets.sort((a, b) => b.balance_due - a.balance_due);
  res.json({ targets, count: targets.length });
});

// POST /api/balance-reminders/log
app.post('/api/balance-reminders/log', (req, res) => {
  const { member_id, branch_id, balance_due, channel, status, outcome, promised_date, error_message, sender_name, actor_id } = req.body;

  if (!member_id) {
    return res.status(400).json({ error: 'member_id is required' });
  }

  const mem = members.find(m => m.id === member_id);
  const logRecord: BalanceReminderLog = {
    id: `brem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    member_id,
    branch_id: branch_id || mem?.branch_id,
    balance_due: balance_due !== undefined ? Number(balance_due) : (mem?.balance_due || 0),
    channel: channel || 'whatsapp',
    status: status || 'sent',
    outcome: outcome || (promised_date ? 'promised' : undefined),
    promised_date: promised_date || undefined,
    error_message: error_message || undefined,
    actor_id: actor_id || undefined,
    created_at: new Date().toISOString()
  };

  balanceReminderLogs.unshift(logRecord);

  if (status === 'sent' && mem) {
    const outcomeText = promised_date ? ` (Promise To Pay: ${promised_date})` : '';
    crmActivities.unshift({
      id: `crm_brem_${Date.now()}`,
      member_id: mem.id,
      branch_id: mem.branch_id,
      type: 'whatsapp_sent',
      title: `💬 Balance Reminder Logged (${(channel || 'whatsapp').toUpperCase()})`,
      description: `Logged reminder for outstanding dues of ₹${(logRecord.balance_due).toLocaleString('en-IN')} to ${mem.full_name}.${outcomeText}`,
      actor_name: sender_name || 'Staff',
      created_at: new Date().toISOString()
    });
  }

  res.status(201).json({ success: true, log: logRecord });
});

// GET /api/sales-totals
app.get('/api/sales-totals', (req, res) => {
  const { branch_id, day } = req.query;
  const targetDay = (typeof day === 'string' && day) ? day : getTodayStr();

  const d = new Date(targetDay);
  const dayOfWeek = d.getDay();
  const diffToMon = (dayOfWeek + 6) % 7;
  const startOfWeek = new Date(d);
  startOfWeek.setDate(d.getDate() - diffToMon);
  const startOfWeekStr = startOfWeek.toISOString().slice(0, 10);
  const startOfMonthStr = `${targetDay.slice(0, 7)}-01`;

  const relevantPayments = paymentHistory.filter(p => {
    const pMethod = String(p.payment_method || '').toLowerCase();
    if (pMethod === 'adjusted' || p.entry_type === 'freeze') return false;
    if (branch_id && branch_id !== 'all' && p.branch_id !== branch_id) return false;
    return true;
  });

  let dayTotal = 0;
  let weekTotal = 0;
  let monthTotal = 0;

  for (const p of relevantPayments) {
    const pDate = p.entry_date || p.created_at.slice(0, 10);
    const amt = Number(p.amount) || 0;
    if (pDate === targetDay) {
      dayTotal += amt;
    }
    if (pDate >= startOfWeekStr && pDate <= targetDay) {
      weekTotal += amt;
    }
    if (pDate >= startOfMonthStr && pDate <= targetDay) {
      monthTotal += amt;
    }
  }

  res.json({
    day: dayTotal,
    week: weekTotal,
    month: monthTotal
  });
});

// GET /api/shift-close-totals
app.get('/api/shift-close-totals', (req, res) => {
  const { branch_id, day } = req.query;
  const targetDay = (typeof day === 'string' && day) ? day : getTodayStr();

  const dayPayments = paymentHistory.filter(p => {
    const pDate = p.entry_date || p.created_at.slice(0, 10);
    if (pDate !== targetDay) return false;
    if (branch_id && branch_id !== 'all' && p.branch_id !== branch_id) return false;
    return true;
  });

  let upi = 0;
  let cash = 0;
  let card = 0;
  let bank_transfer = 0;
  let adjusted = 0;
  let nCount = 0;
  let rCount = 0;
  let bCount = 0;
  let fCount = 0;

  for (const p of dayPayments) {
    const amt = Number(p.amount) || 0;
    const method = String(p.payment_method || '').toLowerCase();
    const eType = p.entry_type;

    if (eType === 'new') nCount++;
    else if (eType === 'renewal') rCount++;
    else if (eType === 'balance') bCount++;
    else if (eType === 'freeze') fCount++;

    if (method.includes('upi') || method.includes('gpay') || method.includes('phonepe') || method.includes('bhim')) {
      upi += amt;
    } else if (method.includes('cash')) {
      cash += amt;
    } else if (method.includes('card') || method.includes('pos')) {
      card += amt;
    } else if (method.includes('bank') || method.includes('neft') || method.includes('imps')) {
      bank_transfer += amt;
    } else if (method.includes('adjust') || eType === 'freeze') {
      adjusted += amt;
    } else {
      upi += amt;
    }
  }

  const total = upi + cash + card + bank_transfer;

  res.json({
    day: targetDay,
    upi,
    cash,
    card,
    bank_transfer,
    adjusted,
    total,
    n_count: nCount,
    r_count: rCount,
    b_count: bCount,
    f_count: fCount
  });
});

// GET /api/balance-reminders/logs
app.get('/api/balance-reminders/logs', (req, res) => {
  const { branch_id, member_id } = req.query;
  let list = [...balanceReminderLogs];
  if (branch_id && branch_id !== 'all') {
    list = list.filter(l => l.branch_id === branch_id);
  }
  if (member_id) {
    list = list.filter(l => l.member_id === member_id);
  }
  res.json({ logs: list, total: list.length });
});

// GET /api/balance-reminders/settings
app.get('/api/balance-reminders/settings', (req, res) => {
  const { branch_id } = req.query;
  const targetId = typeof branch_id === 'string' && branch_id !== 'all' ? branch_id : 'br_nag_1';
  const cfg = balanceReminderSettings[targetId] || {
    branch_id: targetId,
    min_balance: 1,
    cooldown_days: 3,
    include_expired: false,
    max_digest_rows: 40,
    enabled: true,
    updated_at: new Date().toISOString()
  };
  res.json(cfg);
});

// PUT /api/balance-reminders/settings
app.put('/api/balance-reminders/settings', (req, res) => {
  const { branch_id, min_balance, cooldown_days, include_expired, max_digest_rows, enabled } = req.body;
  const targetId = branch_id || 'br_nag_1';

  balanceReminderSettings[targetId] = {
    branch_id: targetId,
    min_balance: min_balance !== undefined ? Number(min_balance) : 1,
    cooldown_days: cooldown_days !== undefined ? Number(cooldown_days) : 3,
    include_expired: include_expired !== undefined ? Boolean(include_expired) : false,
    max_digest_rows: max_digest_rows !== undefined ? Number(max_digest_rows) : 40,
    enabled: enabled !== undefined ? Boolean(enabled) : true,
    updated_at: new Date().toISOString()
  };

  res.json({ success: true, settings: balanceReminderSettings[targetId] });
});

// POST /api/balance-reminders/digest (Edge Cron Handler)
app.post('/api/balance-reminders/digest', (req, res) => {
  const { branch_id } = req.body || {};
  const activeBranches = branch_id && branch_id !== 'all'
    ? branches.filter(b => b.id === branch_id)
    : branches;

  const digests: Array<{
    branch_id: string;
    branch_name: string;
    target_count: number;
    total_balance_due: number;
    top_targets: Array<{ member_name: string; phone: string; balance_due: number }>;
  }> = [];

  for (const br of activeBranches) {
    const branchTargets: BalanceReminderTarget[] = [];
    for (const m of members) {
      if (m.is_archived || m.branch_id !== br.id) continue;
      const bal = Number(m.balance_due) || 0;
      if (bal < 1) continue;

      const p10 = phone10(m.phone);
      if (!p10) continue;

      branchTargets.push({
        member_id: m.id,
        full_name: m.full_name,
        phone: m.phone,
        balance_due: bal,
        branch_id: br.id,
        branch_name: br.name,
        days_overdue: 0,
        package_type: m.package_type,
        status: m.status
      });
    }

    branchTargets.sort((a, b) => b.balance_due - a.balance_due);
    const totalDue = branchTargets.reduce((sum, t) => sum + t.balance_due, 0);

    digests.push({
      branch_id: br.id,
      branch_name: br.name,
      target_count: branchTargets.length,
      total_balance_due: totalDue,
      top_targets: branchTargets.slice(0, 10).map(t => ({
        member_name: t.full_name,
        phone: t.phone,
        balance_due: t.balance_due
      }))
    });
  }

  res.json({
    success: true,
    ran_at: new Date().toISOString(),
    branches_processed: digests.length,
    digests
  });
});

// GET /api/day-register (Unified Day Register Query API)
app.get('/api/day-register', (req, res) => {
  const { date, branch_id } = req.query;
  const targetDate = typeof date === 'string' ? date : getTodayStr();

  // Find all payment records on target date
  let dayPayments = paymentHistory.filter(p => {
    const pDate = p.entry_date || p.created_at.slice(0, 10);
    return pDate === targetDate;
  });

  if (branch_id && branch_id !== 'all') {
    dayPayments = dayPayments.filter(p => {
      if (p.branch_id) return p.branch_id === branch_id;
      const mem = members.find(m => m.id === p.member_id);
      return mem?.branch_id === branch_id;
    });
  }

  const entries: DayRegisterEntry[] = dayPayments.map((p, idx) => {
    const mem = members.find(m => m.id === p.member_id);
    const branch = branches.find(b => b.id === (p.branch_id || mem?.branch_id));

    return {
      id: p.id,
      row_number: idx + 1,
      entry_type: p.entry_type || (mem?.amount_paid === p.amount ? 'new' : 'balance'),
      member_id: p.member_id,
      full_name: mem?.full_name || 'Member',
      phone: mem?.phone || '',
      gender: mem?.gender,
      months: mem?.subscription_months,
      amount: p.amount,
      payment_method: p.payment_method,
      list_price: p.list_price,
      balance_after: p.balance_after !== undefined ? p.balance_after : (mem?.balance_due || 0),
      notes: p.notes,
      entry_date: p.entry_date || p.created_at.slice(0, 10),
      branch_id: p.branch_id || mem?.branch_id,
      branch_name: branch?.name || mem?.branch_name,
      created_at: p.created_at
    };
  });

  const totalCollected = entries.reduce((s, e) => s + e.amount, 0);
  const upiCollected = entries.filter(e => String(e.payment_method).toLowerCase().includes('upi') || String(e.payment_method).toLowerCase().includes('gpay') || String(e.payment_method).toLowerCase().includes('phonepe')).reduce((s, e) => s + e.amount, 0);
  const cashCollected = entries.filter(e => String(e.payment_method).toLowerCase().includes('cash')).reduce((s, e) => s + e.amount, 0);
  const cardCollected = entries.filter(e => String(e.payment_method).toLowerCase().includes('card')).reduce((s, e) => s + e.amount, 0);
  const bankTransferCollected = totalCollected - (upiCollected + cashCollected + cardCollected);

  const newJoinsCount = entries.filter(e => e.entry_type === 'new').length;
  const renewalsCount = entries.filter(e => e.entry_type === 'renewal').length;
  const balanceCollectionsCount = entries.filter(e => e.entry_type === 'balance').length;

  const summary: DayRegisterSummary = {
    date: targetDate,
    total_entries: entries.length,
    new_joins_count: newJoinsCount,
    renewals_count: renewalsCount,
    balance_collections_count: balanceCollectionsCount,
    total_collected: totalCollected,
    upi_collected: upiCollected,
    cash_collected: cashCollected,
    card_collected: cardCollected,
    bank_transfer_collected: Math.max(0, bankTransferCollected),
    total_balance_generated: entries.reduce((s, e) => s + (e.balance_after || 0), 0)
  };

  res.json({ date: targetDate, summary, entries });
});

// Cross-Branch Member Transfer
app.post('/api/members/:id/transfer', (req, res) => {
  const { id } = req.params;
  const { new_branch_id, transferred_by, reason } = req.body;

  const member = members.find(m => m.id === id);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const targetBranch = branches.find(b => b.id === new_branch_id);
  if (!targetBranch) {
    return res.status(404).json({ error: 'Target branch not found' });
  }

  const oldBranchName = member.branch_name || 'Previous Branch';
  member.branch_id = targetBranch.id;
  member.branch_name = targetBranch.name;
  member.updated_at = new Date().toISOString();

  // Log CRM Activity
  crmActivities.unshift({
    id: `crm_${Date.now()}`,
    member_id: member.id,
    branch_id: targetBranch.id,
    type: 'stage_change',
    title: '🏢 Branch Transfer Completed',
    description: `Transferred from ${oldBranchName} to ${targetBranch.name}. Reason: ${reason || 'Customer request'}.`,
    actor_name: transferred_by || 'Gym Management',
    created_at: new Date().toISOString()
  });

  // Log Audit
  auditLogs.unshift({
    id: `aud_${Date.now()}`,
    user_id: transferred_by || 'usr_owner_1',
    user_name: 'Management',
    user_role: 'owner',
    action: 'MEMBER_TRANSFERRED',
    entity_type: 'member',
    entity_id: member.id,
    old_value: { branch_name: oldBranchName },
    new_value: { branch_name: targetBranch.name, reason },
    branch_id: targetBranch.id,
    created_at: new Date().toISOString()
  });

  res.json({ success: true, member });
});

// Member Freeze / Pause Membership
app.post('/api/members/:id/freeze', (req, res) => {
  const { id } = req.params;
  const { start_date, end_date, reason, frozen_by } = req.body;

  const member = members.find(m => m.id === id);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  member.freeze_info = {
    is_frozen: true,
    freeze_start: start_date,
    freeze_end: end_date,
    reason
  };
  member.updated_at = new Date().toISOString();

  crmActivities.unshift({
    id: `crm_${Date.now()}`,
    member_id: member.id,
    branch_id: member.branch_id,
    type: 'freeze',
    title: '❄️ Membership Frozen',
    description: `Membership paused from ${start_date} to ${end_date}. Reason: ${reason || 'Not specified'}.`,
    actor_name: frozen_by || 'Staff',
    created_at: new Date().toISOString()
  });

  res.json({ success: true, member });
});

// 2. Lead Management API
app.get('/api/leads', (req, res) => {
  const { branch_id, status, search } = req.query;
  let list = [...leads];

  if (branch_id && typeof branch_id === 'string' && branch_id !== 'all') {
    list = list.filter(l => l.branch_id === branch_id);
  }
  if (status && typeof status === 'string' && status !== 'all') {
    list = list.filter(l => l.status === status);
  }
  if (search && typeof search === 'string') {
    const q = search.toLowerCase().trim();
    list = list.filter(l =>
      l.full_name.toLowerCase().includes(q) ||
      l.phone.includes(q) ||
      (l.email && l.email.toLowerCase().includes(q))
    );
  }

  list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json(list);
});

app.post('/api/leads', (req, res) => {
  const { full_name, phone, email, source, status, interested_plan, budget, follow_up_date, notes, assigned_trainer_id, branch_id } = req.body;

  if (!full_name || !phone) {
    return res.status(400).json({ error: 'Lead full name and phone number are required.' });
  }

  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const branch = branches.find(b => b.id === branch_id) || branches[0];
  const trainer = profiles.find(p => p.id === assigned_trainer_id);

  const newLead: Lead = {
    id: `lead_${Date.now()}`,
    full_name: full_name.trim(),
    phone: cleanPhone,
    email: email ? email.trim() : undefined,
    source: source || 'Walk-in',
    status: status || 'Cold',
    interested_plan: interested_plan || 'General Gym',
    budget: budget ? parseFloat(budget) : undefined,
    follow_up_date: follow_up_date || undefined,
    notes: notes || undefined,
    assigned_trainer_id: trainer ? trainer.id : undefined,
    assigned_trainer_name: trainer ? trainer.full_name : undefined,
    branch_id: branch.id,
    branch_name: branch.name,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  leads.unshift(newLead);
  res.status(201).json(newLead);
});

app.put('/api/leads/:id', (req, res) => {
  const { id } = req.params;
  const lead = leads.find(l => l.id === id);
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  const { status, follow_up_date, notes, assigned_trainer_id } = req.body;
  if (status) lead.status = status;
  if (follow_up_date !== undefined) lead.follow_up_date = follow_up_date;
  if (notes !== undefined) lead.notes = notes;
  if (assigned_trainer_id) {
    const trainer = profiles.find(p => p.id === assigned_trainer_id);
    if (trainer) {
      lead.assigned_trainer_id = trainer.id;
      lead.assigned_trainer_name = trainer.full_name;
    }
  }
  lead.updated_at = new Date().toISOString();

  res.json(lead);
});

// Convert Lead to Member
app.post('/api/leads/:id/convert', (req, res) => {
  const { id } = req.params;
  const lead = leads.find(l => l.id === id);
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  lead.status = 'Converted';
  lead.updated_at = new Date().toISOString();

  // Create pending member record prefilled
  const trainer = profiles.find(p => p.id === lead.assigned_trainer_id) || profiles.find(p => p.role === 'trainer') || profiles[0];
  const newMember: Member = {
    id: `mem_${Date.now()}`,
    full_name: lead.full_name,
    phone: lead.phone,
    email: lead.email,
    notes: `Converted from Lead (${lead.source}). ${lead.notes || ''}`,
    status: 'pending',
    lifecycle_stage: 'member',
    package_type: (lead.interested_plan as PlanPackage) || 'General Gym',
    onboarded_by: trainer.id,
    trainer_name: trainer.full_name,
    branch_id: lead.branch_id,
    branch_name: lead.branch_name,
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  members.unshift(newMember);

  crmActivities.unshift({
    id: `crm_${Date.now()}`,
    member_id: newMember.id,
    branch_id: lead.branch_id,
    type: 'joined',
    title: '🎉 Lead Converted to Member',
    description: `Lead from ${lead.source} converted into pending member record.`,
    actor_name: trainer.full_name,
    created_at: new Date().toISOString()
  });

  res.json({ lead, member: newMember });
});

// 3. CRM Activities Timeline API
app.get('/api/crm-activities', (req, res) => {
  const { member_id, branch_id, type } = req.query;
  let list = [...crmActivities];

  if (member_id && typeof member_id === 'string') {
    list = list.filter(c => c.member_id === member_id);
  }
  if (branch_id && typeof branch_id === 'string' && branch_id !== 'all') {
    list = list.filter(c => c.branch_id === branch_id);
  }
  if (type && typeof type === 'string' && type !== 'all') {
    list = list.filter(c => c.type === type);
  }

  list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json(list);
});

app.post('/api/crm-activities', (req, res) => {
  const { member_id, branch_id, type, title, description, actor_name, metadata } = req.body;
  if (!member_id || !title || !description) {
    return res.status(400).json({ error: 'Member ID, title, and description are required.' });
  }

  const activity: CRMActivity = {
    id: `crm_${Date.now()}`,
    member_id,
    branch_id: branch_id || 'br_hq_1',
    type: type || 'note',
    title: title.trim(),
    description: description.trim(),
    actor_name: actor_name || 'Staff',
    metadata: metadata || undefined,
    created_at: new Date().toISOString()
  };

  crmActivities.unshift(activity);
  res.status(201).json(activity);
});

// 4. Automations API
app.get('/api/automation-rules', (req, res) => {
  res.json(automationRules);
});

app.post('/api/automation-rules', (req, res) => {
  const { name, trigger_event, action_type, is_enabled, branch_id } = req.body;
  if (!name || !trigger_event || !action_type) {
    return res.status(400).json({ error: 'Name, trigger event, and action type are required.' });
  }

  const newRule: AutomationRule = {
    id: `rule_${Date.now()}`,
    name: name.trim(),
    trigger_event,
    action_type,
    is_enabled: is_enabled !== undefined ? is_enabled : true,
    branch_id,
    created_at: new Date().toISOString()
  };

  automationRules.push(newRule);
  res.status(201).json(newRule);
});

app.post('/api/automations/run', (req, res) => {
  const attendanceMap: Record<string, string> = {};
  attendanceLogs.forEach(att => {
    if (!attendanceMap[att.member_id] || att.checked_in_at > attendanceMap[att.member_id]) {
      attendanceMap[att.member_id] = att.checked_in_at;
    }
  });

  const result = evaluateAutomations(automationRules, members, leads, attendanceMap);
  automationLogs.unshift(...result.logs);
  crmActivities.unshift(...result.crmActivities);

  res.json({
    success: true,
    evaluatedCount: result.evaluatedCount,
    triggeredCount: result.triggeredCount,
    newLogsCount: result.logs.length
  });
});

app.get('/api/automation-logs', (req, res) => {
  res.json(automationLogs);
});

// 5. Member Measurements API
app.get('/api/members/:id/measurements', (req, res) => {
  const { id } = req.params;
  const list = measurements
    .filter(m => m.member_id === id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  res.json(list);
});

app.post('/api/members/:id/measurements', (req, res) => {
  const { id } = req.params;
  const { date, weight_kg, body_fat_pct, waist_inches, chest_inches, biceps_inches, notes } = req.body;

  const newMeasurement: MemberMeasurement = {
    id: `meas_${Date.now()}`,
    member_id: id,
    date: date || getTodayStr(),
    weight_kg: weight_kg ? parseFloat(weight_kg) : undefined,
    body_fat_pct: body_fat_pct ? parseFloat(body_fat_pct) : undefined,
    waist_inches: waist_inches ? parseFloat(waist_inches) : undefined,
    chest_inches: chest_inches ? parseFloat(chest_inches) : undefined,
    biceps_inches: biceps_inches ? parseFloat(biceps_inches) : undefined,
    notes: notes || undefined,
    created_at: new Date().toISOString()
  };

  measurements.unshift(newMeasurement);

  crmActivities.unshift({
    id: `crm_${Date.now()}`,
    member_id: id,
    type: 'measurement',
    title: '📏 Body Measurements Updated',
    description: `Weight: ${weight_kg ? weight_kg + 'kg' : 'N/A'}, Body Fat: ${body_fat_pct ? body_fat_pct + '%' : 'N/A'}, Waist: ${waist_inches ? waist_inches + '"' : 'N/A'}.`,
    actor_name: 'Trainer / Member',
    created_at: new Date().toISOString()
  });

  res.status(201).json(newMeasurement);
});

// 6. Freeze Requests API
app.get('/api/freeze-requests', (req, res) => {
  res.json(freezeRequests);
});

app.post('/api/freeze-requests', (req, res) => {
  const { member_id, member_name, start_date, end_date, reason } = req.body;
  if (!member_id || !start_date || !end_date || !reason) {
    return res.status(400).json({ error: 'Member ID, start date, end date, and reason are required.' });
  }

  const member = members.find(m => m.id === member_id);
  if (!member) {
    return res.status(404).json({ error: 'Member not found', code: 'MEMBER_NOT_FOUND' });
  }

  // Strict Annual Validation
  const subMonths = Number(member.subscription_months || 0);
  const pkg = String(member.package_type || '').toLowerCase();
  const isAnnual = subMonths === 12 || /annual|year|yearly|12\s*month/.test(pkg);

  if (!isAnnual) {
    return res.status(400).json({
      error: 'Membership freeze is strictly reserved for 12-month / Annual members only.',
      code: 'FREEZE_ANNUAL_ONLY'
    });
  }

  // Max 30 days (1 month) validation
  const start = new Date(start_date).getTime();
  const end = new Date(end_date).getTime();
  const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
  if (diffDays > 30 || diffDays < 1) {
    return res.status(400).json({
      error: 'Freeze duration cannot exceed 30 calendar days (1 month).',
      code: 'FREEZE_MAX_30_DAYS'
    });
  }

  const reqObj: MemberFreezeRequest = {
    id: `frz_${Date.now()}`,
    member_id,
    member_name: member_name || (member ? member.full_name : 'Member'),
    start_date,
    end_date,
    reason: reason.trim(),
    status: 'pending',
    branch_id: member ? member.branch_id : undefined,
    created_at: new Date().toISOString()
  };

  freezeRequests.unshift(reqObj);
  res.status(201).json(reqObj);
});

app.put('/api/freeze-requests/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'approved' | 'rejected'

  const freq = freezeRequests.find(r => r.id === id);
  if (!freq) {
    return res.status(404).json({ error: 'Freeze request not found' });
  }

  freq.status = status;

  if (status === 'approved') {
    const member = members.find(m => m.id === freq.member_id);
    if (member) {
      member.freeze_info = {
        is_frozen: true,
        freeze_start: freq.start_date,
        freeze_end: freq.end_date,
        reason: freq.reason
      };

      crmActivities.unshift({
        id: `crm_${Date.now()}`,
        member_id: member.id,
        branch_id: member.branch_id,
        type: 'freeze',
        title: '❄️ Membership Freeze Approved',
        description: `Approved pause from ${freq.start_date} to ${freq.end_date}. Reason: ${freq.reason}`,
        actor_name: 'Branch Manager / Owner',
        created_at: new Date().toISOString()
      });
    }
  }

  res.json(freq);
});

// 7. Gym Announcements API
app.get('/api/announcements', (req, res) => {
  res.json(announcements);
});

app.post('/api/announcements', (req, res) => {
  const { title, content, author_name, category, branch_id } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required.' });
  }

  const ann: GymAnnouncement = {
    id: `ann_${Date.now()}`,
    branch_id: branch_id || undefined,
    title: title.trim(),
    content: content.trim(),
    author_name: author_name || 'Management',
    category: category || 'general',
    created_at: new Date().toISOString()
  };

  announcements.unshift(ann);
  res.status(201).json(ann);
});

// 9. AI Retention Engine API
app.get('/api/retention/risk-score/:memberId', (req, res) => {
  const { memberId } = req.params;
  const member = members.find((m) => m.id === memberId);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  let existing = memberRiskScores.find((r) => r.member_id === memberId);
  if (!existing) {
    const computed = calculateMemberRisk(member, attendanceLogs);
    existing = {
      id: `rsk_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      member_id: member.id,
      branch_id: member.branch_id,
      risk_score: computed.score,
      risk_level: computed.level,
      reasons: computed.reasons,
      calculated_at: new Date().toISOString(),
    };
    memberRiskScores.push(existing);
  }

  res.json(existing);
});

app.post('/api/retention/calculate-risk', (req, res) => {
  const activeMembers = members.filter((m) => !m.is_archived && m.status === 'active');
  const now = new Date().toISOString();

  activeMembers.forEach((member) => {
    const computed = calculateMemberRisk(member, attendanceLogs);
    const existingIndex = memberRiskScores.findIndex((r) => r.member_id === member.id);
    const scoreRecord: MemberRiskScore = {
      id: existingIndex >= 0 ? memberRiskScores[existingIndex].id : `rsk_${Date.now()}_${member.id}`,
      member_id: member.id,
      branch_id: member.branch_id,
      risk_score: computed.score,
      risk_level: computed.level,
      reasons: computed.reasons,
      calculated_at: now,
    };

    if (existingIndex >= 0) {
      memberRiskScores[existingIndex] = scoreRecord;
    } else {
      memberRiskScores.push(scoreRecord);
    }

    // Generate retention alert if score >= 70
    if (computed.score >= 70) {
      const hasUnresolvedAlert = retentionAlerts.some(
        (a) => a.member_id === member.id && !a.is_resolved
      );
      if (!hasUnresolvedAlert) {
        retentionAlerts.unshift({
          id: `alt_${Date.now()}_${member.id}`,
          member_id: member.id,
          branch_id: member.branch_id,
          alert_type: 'at_risk',
          severity: 'high',
          message: computed.reasons.join(' · ') || `At-risk score of ${computed.score}/100 detected.`,
          is_resolved: false,
          created_at: now,
        });

        // Add staff notification for trainer & branch manager
        staffNotifications.unshift({
          id: `notif_${Date.now()}_${member.id}`,
          user_id: member.onboarded_by || 'usr_owner_1',
          branch_id: member.branch_id,
          type: 'high_risk',
          title: `⚠️ At-Risk Member: ${member.full_name}`,
          body: `Score ${computed.score}/100: ${computed.reasons[0] || 'Member needs retention outreach.'}`,
          member_id: member.id,
          is_read: false,
          created_at: now,
        });
      }
    }
  });

  res.json({
    success: true,
    processedCount: activeMembers.length,
    highRiskCount: memberRiskScores.filter((r) => r.risk_level === 'high').length,
    calculated_at: now,
  });
});

app.get('/api/retention/alerts', (req, res) => {
  const { branch_id, role } = req.query;
  let filtered = retentionAlerts.filter((a) => !a.is_resolved);

  if (branch_id && branch_id !== 'all' && role !== 'super_owner') {
    filtered = filtered.filter((a) => a.branch_id === branch_id);
  }

  // Hydrate with member details
  const hydrated = filtered.map((alert) => {
    const member = members.find((m) => m.id === alert.member_id);
    return {
      ...alert,
      member: member
        ? {
            id: member.id,
            full_name: member.full_name,
            phone: member.phone,
            end_date: member.end_date,
            balance_due: member.balance_due,
            package_type: member.package_type,
          }
        : undefined,
    };
  });

  res.json({ alerts: hydrated, risk_scores: memberRiskScores });
});

app.post('/api/retention/alerts/:id/resolve', (req, res) => {
  const { id } = req.params;
  const { disposition, note, resolved_by } = req.body;

  const alert = retentionAlerts.find((a) => a.id === id);
  if (!alert) {
    return res.status(404).json({ error: 'Alert not found' });
  }

  alert.is_resolved = true;
  alert.resolved_by = resolved_by || 'Staff';
  alert.resolved_at = new Date().toISOString();

  const finalDisposition = disposition || 'called';

  // Log in CRM activities
  crmActivities.unshift({
    id: `crm_${Date.now()}`,
    member_id: alert.member_id,
    branch_id: alert.branch_id,
    type: 'note',
    title: `🛡️ Retention Alert Resolved [${finalDisposition.toUpperCase()}]`,
    description: `Alert marked resolved with outcome: ${finalDisposition}. Note: ${note || 'Addressed by staff.'}`,
    actor_name: resolved_by || 'Staff',
    created_at: new Date().toISOString(),
  });

  // Write to Audit Logs
  auditLogs.unshift({
    id: `audit_${Date.now()}`,
    user_id: resolved_by || 'staff',
    user_name: resolved_by || 'Staff',
    user_role: 'trainer',
    action: 'RETENTION_ALERT_RESOLVED',
    entity_type: 'retention_alert',
    entity_id: alert.id,
    new_value: { disposition: finalDisposition, note },
    branch_id: alert.branch_id,
    created_at: new Date().toISOString(),
  });

  res.json({ success: true, alert, disposition: finalDisposition });
});

app.get('/api/retention/outreach-logs', (req, res) => {
  const { branch_id } = req.query;
  let logs = [...retentionOutreachLogs];
  if (branch_id && branch_id !== 'all') {
    logs = logs.filter((l) => l.branch_id === branch_id);
  }
  res.json(logs);
});

app.post('/api/retention/send-outreach', (req, res) => {
  const { alert_id, member_id, branch_id, channel, message_body, sender_id, sender_name } = req.body;

  if (!member_id || !message_body) {
    return res.status(400).json({ error: 'Member ID and message body are required' });
  }

  const member = members.find((m) => m.id === member_id);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  // Silence hours check (9 PM to 8 AM IST)
  const currentHour = new Date().getHours();
  const isSilenceHours = currentHour >= 21 || currentHour < 8;

  const logRecord: RetentionOutreachLog = {
    id: `out_${Date.now()}`,
    member_id: member.id,
    branch_id: branch_id || member.branch_id,
    alert_id: alert_id || undefined,
    channel: channel || 'whatsapp',
    status: isSilenceHours ? 'skipped' : 'sent',
    message_body,
    provider_response: {
      provider: channel === 'sms' ? 'MSG91_DLT_GATEWAY' : 'WHATSAPP_CLOUD_API',
      message_id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      status: isSilenceHours ? 'BUFFERED_QUIET_HOURS' : 'DELIVERED',
    },
    sent_at: new Date().toISOString(),
  };

  retentionOutreachLogs.unshift(logRecord);
  member.last_retention_outreach_at = new Date().toISOString();

  crmActivities.unshift({
    id: `crm_${Date.now()}`,
    member_id: member.id,
    branch_id: member.branch_id,
    type: 'whatsapp_sent',
    title: `📤 Retention Outreach (${channel.toUpperCase()})`,
    description: `Sent: "${message_body.slice(0, 100)}..." via ${channel.toUpperCase()}`,
    actor_name: sender_name || 'Staff',
    created_at: new Date().toISOString(),
  });

  res.json({
    success: true,
    provider: channel === 'sms' ? 'MSG91 DLT SMS' : 'WhatsApp Cloud API',
    log: logRecord,
    isSilenceHours,
  });
});

// 10. UPI Auto-Debit / E-Mandate API
app.post('/api/autodebit/create-mandate', (req, res) => {
  const { member_id, amount, max_cycles } = req.body;
  const member = members.find((m) => m.id === member_id);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const subId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  member.auto_debit_enabled = true;
  member.razorpay_subscription_id = subId;
  member.mandate_status = 'active';
  member.next_billing_date = member.end_date || addMonthsToDate(getTodayStr(), 1);

  crmActivities.unshift({
    id: `crm_${Date.now()}`,
    member_id: member.id,
    branch_id: member.branch_id,
    type: 'payment',
    title: '💳 UPI AutoPay Mandate Authorized',
    description: `E-Mandate linked (${subId}) for automated monthly renewals of ₹${(amount || 2000).toLocaleString('en-IN')}.`,
    actor_name: 'Razorpay UPI AutoPay',
    created_at: new Date().toISOString(),
  });

  res.json({
    success: true,
    subscription_id: subId,
    mandate_status: 'active',
    next_billing_date: member.next_billing_date,
  });
});

app.post('/api/autodebit/charge-mandate', (req, res) => {
  const { member_id, amount } = req.body;
  const member = members.find((m) => m.id === member_id);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const chargeAmount = parseFloat(amount) || (member.balance_due && member.balance_due > 0 ? member.balance_due : 2000);
  const isSimulatedFailure = req.body.simulate_failure === true;

  const attempt: AutoDebitAttempt = {
    id: `adb_${Date.now()}`,
    member_id: member.id,
    branch_id: member.branch_id,
    amount: chargeAmount,
    status: isSimulatedFailure ? 'failed' : 'success',
    razorpay_payment_id: isSimulatedFailure ? undefined : `pay_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    failure_reason: isSimulatedFailure ? 'UPI_INSUFFICIENT_FUNDS_OR_EXPIRED' : undefined,
    attempted_at: new Date().toISOString(),
  };

  autoDebitAttempts.unshift(attempt);

  if (isSimulatedFailure) {
    member.mandate_status = 'failed';
    retentionAlerts.unshift({
      id: `alt_${Date.now()}_${member.id}`,
      member_id: member.id,
      branch_id: member.branch_id,
      alert_type: 'auto_debit_failed',
      severity: 'high',
      message: `UPI AutoPay attempt of ₹${chargeAmount.toLocaleString('en-IN')} failed (Insufficient Funds).`,
      is_resolved: false,
      created_at: new Date().toISOString(),
    });

    staffNotifications.unshift({
      id: `notif_${Date.now()}_${member.id}`,
      user_id: member.onboarded_by || 'usr_owner_1',
      branch_id: member.branch_id,
      type: 'auto_debit_failed',
      title: `❌ Auto-Debit Failed: ${member.full_name}`,
      body: `UPI AutoPay failed for ₹${chargeAmount.toLocaleString('en-IN')}. Reach out to update payment method.`,
      member_id: member.id,
      is_read: false,
      created_at: new Date().toISOString(),
    });

    return res.status(400).json({ success: false, attempt });
  }

  // Successful charge: reduce balance_due and record payment
  if (member.balance_due && member.balance_due > 0) {
    member.balance_due = Math.max(0, member.balance_due - chargeAmount);
  }

  const paymentRecord: PaymentRecord = {
    id: `pay_${Date.now()}`,
    member_id: member.id,
    amount: chargeAmount,
    payment_method: 'UPI / GPay / PhonePe',
    payment_reference: attempt.razorpay_payment_id,
    notes: 'Automated recurring charge via Razorpay UPI AutoPay',
    received_by: 'system_autopay',
    received_by_name: 'Razorpay UPI AutoPay',
    created_at: new Date().toISOString(),
  };

  paymentHistory.unshift(paymentRecord);

  // Write commission settlement row on successful auto-debit
  recordCommissionSettlementOnPayment(paymentRecord.id, member, chargeAmount, 'UPI AutoPay Recurring Charge');

  // Win-back conversion trigger
  convertWinbackEnrollmentOnPayment(member.id);
  refreshChurnPredictions();

  crmActivities.unshift({
    id: `crm_${Date.now()}`,
    member_id: member.id,
    branch_id: member.branch_id,
    type: 'payment',
    title: `💰 UPI Auto-Debit Success (₹${chargeAmount.toLocaleString('en-IN')})`,
    description: `Automated payment debited via E-Mandate. Ref: ${attempt.razorpay_payment_id}.`,
    actor_name: 'Razorpay Subscriptions',
    created_at: new Date().toISOString(),
  });

  res.json({ success: true, attempt, payment: paymentRecord });
});

app.post('/api/autodebit/update-status', (req, res) => {
  const { member_id, status } = req.body;
  const member = members.find((m) => m.id === member_id);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  member.mandate_status = status;
  if (status === 'cancelled') {
    member.auto_debit_enabled = false;
  }

  res.json({ success: true, member });
});

app.get('/api/autodebit/attempts/:memberId', (req, res) => {
  const { memberId } = req.params;
  const list = autoDebitAttempts.filter((a) => a.member_id === memberId);
  res.json(list);
});

// 11. Staff In-App Notifications API
app.get('/api/notifications', (req, res) => {
  const { user_id, branch_id } = req.query;
  let list = [...staffNotifications];
  if (branch_id && branch_id !== 'all') {
    list = list.filter((n) => !n.branch_id || n.branch_id === branch_id);
  }
  res.json(list);
});

app.post('/api/notifications/:id/read', (req, res) => {
  const { id } = req.params;
  const notif = staffNotifications.find((n) => n.id === id);
  if (notif) notif.is_read = true;
  res.json({ success: true });
});

app.post('/api/notifications/read-all', (req, res) => {
  const { user_id } = req.body;
  staffNotifications.forEach((n) => {
    n.is_read = true;
  });
  res.json({ success: true });
});

// 12. WhatsApp / MSG91 Member Inbound Reply Webhook (Condition 160)
app.post('/api/webhooks/whatsapp-reply', (req, res) => {
  const { phone, message, member_id } = req.body;

  const member = members.find((m) => (member_id ? m.id === member_id : m.phone.endsWith(phone?.slice(-10))));
  if (!member) {
    return res.status(404).json({ error: 'Member not found for phone number' });
  }

  const now = new Date().toISOString();

  // Find matching outreach log
  const log = retentionOutreachLogs.find((l) => l.member_id === member.id);
  if (log) {
    log.reply_received = true;
    log.reply_text = message || 'Reply from member';
    log.replied_at = now;
  }

  // Create Staff Notification for trainer & branch manager
  staffNotifications.unshift({
    id: `notif_reply_${Date.now()}`,
    user_id: member.onboarded_by || 'usr_owner_1',
    branch_id: member.branch_id,
    type: 'member_reply',
    title: `💬 Member Reply: ${member.full_name}`,
    body: `"${message || 'I will be coming back next week!'}"`,
    member_id: member.id,
    is_read: false,
    created_at: now,
  });

  crmActivities.unshift({
    id: `crm_${Date.now()}`,
    member_id: member.id,
    branch_id: member.branch_id,
    type: 'note',
    title: `💬 Inbound WhatsApp Reply Received`,
    description: `Member replied: "${message}"`,
    actor_name: member.full_name,
    created_at: now,
  });

  res.json({ success: true, notified_trainer: member.trainer_name });
});

// ==========================================
// FreeLLMAPI Unified Gateway & Gym Engine
// (OpenAI-compatible /v1 & Pulse AI Routes)
// ==========================================

// 1. OpenAI-Compatible GET /v1/models
app.get('/v1/models', (req, res) => {
  const { providers } = getFreeLLMStatus();
  const modelsList: any[] = [];

  providers.forEach((p) => {
    p.models.forEach((m) => {
      modelsList.push({
        id: m,
        object: 'model',
        created: 1710000000,
        owned_by: p.id,
        permission: [],
        root: m,
        parent: null,
      });
    });
  });

  res.json({
    object: 'list',
    data: modelsList,
  });
});

// 2. OpenAI-Compatible POST /v1/chat/completions
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, provider } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: {
          message: 'messages array is required',
          type: 'invalid_request_error',
          param: 'messages',
          code: null,
        },
      });
    }

    const completion = await executeFreeLLMCompletion(
      messages,
      model,
      provider as LLMProviderId
    );

    res.setHeader('x-freellmapi-provider', completion.provider);
    res.setHeader('x-freellmapi-latency-ms', String(completion.latencyMs));
    res.setHeader('x-freellmapi-cost-saved-usd', String(completion.costEstimatedSavedUsd));

    return res.json({
      id: completion.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: completion.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: completion.content,
          },
          finish_reason: 'stop',
        },
      ],
      usage: completion.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
      x_freellmapi: {
        provider: completion.provider,
        latency_ms: completion.latencyMs,
        cost_saved_usd: completion.costEstimatedSavedUsd,
        failover_history: completion.failoverHistory || [],
      },
    });
  } catch (err: any) {
    console.error('[FreeLLMAPI] /v1/chat/completions error:', err);
    return res.status(500).json({
      error: {
        message: err?.message || 'FreeLLMAPI execution failed',
        type: 'api_error',
        code: 500,
      },
    });
  }
});

// 3. FreeLLMAPI Status & Metrics
app.get('/api/freellmapi/status', (req, res) => {
  const status = getFreeLLMStatus();
  res.json(status);
});

// 4. Update FreeLLMAPI Config / Keys
app.post('/api/freellmapi/update-config', (req, res) => {
  const { provider, apiKey, model, enabled, priority } = req.body;
  if (!provider || !PROVIDER_CATALOG[provider as LLMProviderId]) {
    return res.status(400).json({ error: 'Invalid provider ID' });
  }

  if (apiKey !== undefined && process.env.PULSE_ALLOW_RUNTIME_KEYS !== '1') {
    return res.status(403).json({ error: 'API keys must be configured via server environment variables', code: 'RUNTIME_KEYS_DISABLED' });
  }
  if (model !== undefined && (typeof model !== 'string' || model.length > 120)) {
    return res.status(400).json({ error: 'Invalid model' });
  }
  const updates: Record<string, unknown> = {};
  if (apiKey !== undefined) updates.apiKey = String(apiKey);
  if (model !== undefined) updates.model = model;
  if (enabled !== undefined) updates.enabled = Boolean(enabled);
  if (priority !== undefined && Number.isFinite(Number(priority))) updates.priority = Number(priority);
  updateProviderConfig(provider as LLMProviderId, updates);

  res.json({ success: true, status: getFreeLLMStatus() });
});

// 5. Test FreeLLMAPI Provider Latency
app.post('/api/freellmapi/test-provider', async (req, res) => {
  const { provider } = req.body;
  if (!provider || !PROVIDER_CATALOG[provider as LLMProviderId]) {
    return res.status(400).json({ error: 'Invalid provider ID' });
  }

  const result = await testProviderLatency(provider as LLMProviderId);
  res.json(result);
});

// 6. FreeLLMAPI Workout Plan Architect for Trainers
app.post('/api/freellmapi/workout-plan', async (req, res) => {
  try {
    const {
      member_id,
      memberName,
      age,
      gender,
      goal,
      difficulty,
      daysPerWeek,
      injuriesOrNotes,
      trainerName,
    } = req.body;

    let targetName = memberName;
    let targetAge = age;
    let targetGender = gender;

    const member = members.find((m) => m.id === member_id);
    if (member) {
      targetName = targetName || member.full_name;
      targetAge = targetAge || member.age;
      targetGender = targetGender || member.gender;
    }

    const plan = await generateGymWorkoutPlan({
      memberName: targetName || 'Gym Member',
      age: targetAge,
      gender: targetGender,
      goal: goal || 'Hypertrophy & Muscle Tone',
      difficulty: difficulty || 'Intermediate',
      daysPerWeek: daysPerWeek ? Number(daysPerWeek) : 4,
      injuriesOrNotes,
      trainerName: trainerName || 'Pulse Master Coach',
    });

    // Record activity in member's CRM timeline if member exists
    if (member) {
      crmActivities.unshift({
        id: `crm_${Date.now()}`,
        member_id: member.id,
        branch_id: member.branch_id,
        type: 'note',
        title: `🏋️‍♂️ AI Workout Plan Generated: ${plan.title}`,
        description: `Plan: ${plan.daysPerWeek} days/week for ${plan.goal}. Generated via FreeLLMAPI (${plan.providerUsed} / ${plan.modelUsed}).`,
        actor_name: trainerName || 'Trainer AI Studio',
        created_at: new Date().toISOString(),
      });
    }

    res.json(plan);
  } catch (err: any) {
    console.error('[FreeLLMAPI] workout-plan error:', err);
    res.status(500).json({ error: err?.message || 'Failed to generate workout plan' });
  }
});

// 7. FreeLLMAPI Indian Diet & Macro Blueprint Generator
app.post('/api/freellmapi/diet-plan', async (req, res) => {
  try {
    const {
      member_id,
      memberName,
      weightKg,
      heightCm,
      goal,
      dietaryPreference,
      budgetLevel,
      dailyRoutine,
    } = req.body;

    let targetName = memberName;
    const member = members.find((m) => m.id === member_id);
    if (member) {
      targetName = targetName || member.full_name;
    }

    const diet = await generateGymDietPlan({
      memberName: targetName || 'Gym Member',
      weightKg: weightKg ? Number(weightKg) : undefined,
      heightCm: heightCm ? Number(heightCm) : undefined,
      goal: goal || 'Fat Loss & Muscle Preservation',
      dietaryPreference: dietaryPreference || 'Vegetarian',
      budgetLevel: budgetLevel || 'Standard',
      dailyRoutine,
    });

    if (member) {
      crmActivities.unshift({
        id: `crm_${Date.now()}`,
        member_id: member.id,
        branch_id: member.branch_id,
        type: 'note',
        title: `🥗 AI Nutrition Plan Generated: ${diet.title}`,
        description: `Daily Targets: ${diet.targetCalories} kcal, ${diet.proteinGrams}g Protein. Generated via FreeLLMAPI (${diet.providerUsed} / ${diet.modelUsed}).`,
        actor_name: 'Pulse Nutrition Desk',
        created_at: new Date().toISOString(),
      });
    }

    res.json(diet);
  } catch (err: any) {
    console.error('[FreeLLMAPI] diet-plan error:', err);
    res.status(500).json({ error: err?.message || 'Failed to generate diet plan' });
  }
});

// 8. FreeLLMAPI Pulse AI Coach (Member In-App Chat)
app.post('/api/freellmapi/coach-chat', async (req, res) => {
  try {
    const { messages, member_id } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    let memberContext = '';
    if (member_id) {
      const member = members.find((m) => m.id === member_id);
      if (member) {
        memberContext = `Member info: ${member.full_name}, Package: ${member.package_type || 'General Gym'}, Branch: ${member.branch_name || 'Pulse Fitness'}.`;
      }
    }

    const systemPrompt: FreeLLMChatMessage = {
      role: 'system',
      content: `You are Pulse AI, the friendly, evidence-based fitness companion for members of Pulse Fitness (Bengaluru branches: Nagarabhavi, RR Nagar, Banashankari).
You answer member questions concisely, encouragingly, and scientifically.
Give specific advice on exercise form, injury prevention, pre/post workout nutrition (including South & North Indian meal ideas), hydration, and sleep.
${memberContext}
Keep answers structured with bullet points and friendly emoji cues.`,
    };

    const completion = await executeFreeLLMCompletion([
      systemPrompt,
      ...messages,
    ]);

    res.json(completion);
  } catch (err: any) {
    console.error('[FreeLLMAPI] coach-chat error:', err);
    res.status(500).json({ error: err?.message || 'Failed to get coach response' });
  }
});

// 9. FreeLLMAPI Owner AI Broadcast & Campaign Writer
app.post('/api/freellmapi/broadcast-writer', async (req, res) => {
  try {
    const { topic, campaignType, targetAudience, branch_id } = req.body;

    const branch = branches.find((b) => b.id === branch_id);
    const branchName = branch ? branch.name : 'Pulse Fitness Bangalore';

    const systemPrompt: FreeLLMChatMessage = {
      role: 'system',
      content: `You are the Head Marketing & Community Director for Pulse Fitness (${branchName}).
Generate compelling, high-converting gym communications.
Provide 3 tailored versions:
1. Short WhatsApp/SMS Blast (with emojis, under 160 characters, call to action)
2. Detailed In-App Gym Announcement (engaging, motivating)
3. Regional Kannada & Hindi Translations (culturally localized for Bengaluru gym goers)
Return clean Markdown formatting.`,
    };

    const userPrompt: FreeLLMChatMessage = {
      role: 'user',
      content: `Create a ${campaignType || 'promotional'} communication about: "${topic}".
Target: ${targetAudience || 'All active & renewal-due gym members'}
Branch: ${branchName}`,
    };

    const completion = await executeFreeLLMCompletion([systemPrompt, userPrompt]);
    res.json(completion);
  } catch (err: any) {
    console.error('[FreeLLMAPI] broadcast-writer error:', err);
    res.status(500).json({ error: err?.message || 'Failed to generate broadcast' });
  }
});


// ---------------- Banner Studio (owners create; staff & members view active ones) ----------------
interface BannerRecord {
  id: string; type: string; title: string; festival?: string; date?: string; venue?: string; offer?: string; price?: string;
  branch_ids: string[]; theme: string; language: 'en' | 'kn' | 'both'; copy: BannerCopy;
  status: 'active' | 'archived'; visible_to_members: boolean; valid_until?: string;
  copy_source: 'ai' | 'template'; created_by: string; created_by_name: string; created_at: string;
}
let banners: BannerRecord[] = [];
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

function readBannerInput(b: any): { input?: BannerInput & { theme: string; branch_ids: string[] }; error?: string } {
  if (!BANNER_TYPES.includes(b?.type)) return { error: `type must be one of ${BANNER_TYPES.join(', ')}` };
  const theme = THEMES.includes(b.theme) ? b.theme : 'pulse';
  const festival = b.type === 'festival' ? (b.festival in FESTIVALS ? b.festival : null) : undefined;
  if (festival === null) return { error: `festival must be one of ${Object.keys(FESTIVALS).join(', ')}` };
  const branch_ids = Array.isArray(b.branch_ids) && b.branch_ids.length ? b.branch_ids.filter((x: any) => branches.some((br) => br.id === x)) : branches.map((br) => br.id);
  if (!branch_ids.length) return { error: 'Pick at least one valid branch' };
  const language = ['en', 'kn', 'both'].includes(b.language) ? b.language : 'en';
  return {
    input: {
      type: b.type, title: str(b.title, 80), festival: festival || undefined, date: str(b.date, 60), venue: str(b.venue, 100),
      offer: str(b.offer, 100), price: str(b.price, 30), language, theme, branch_ids,
      branchNames: branch_ids.map((id: string) => branches.find((br) => br.id === id)?.name.replace('Pulse Fitness - ', '') || id),
    },
  };
}

app.post('/api/banners/copy', async (req, res) => {
  const { input, error } = readBannerInput(req.body);
  if (!input) return res.status(400).json({ error });
  const fallback = templateCopy(input);
  if (req.body?.useAi === false) return res.json({ copy: fallback, source: 'template' });
  try {
    const completion = await executeFreeLLMCompletion([
      { role: 'system', content: 'You are a concise bilingual (English/Kannada) marketing copywriter for an Indian gym. Output strict JSON only.' },
      { role: 'user', content: bannerPrompt(input) },
    ]);
    const ai = completion.model !== 'pulse-local-smart-engine' ? parseAiCopy(completion.content) : null;
    if (ai) {
      if (!ai.kn) ai.kn = fallback.kn;
      return res.json({ copy: ai, source: 'ai', model: completion.model });
    }
  } catch (err: any) {
    console.warn('[banners] AI copy failed, using template:', err?.message);
  }
  res.json({ copy: fallback, source: 'template' });
});

app.get('/api/banners', (req, res) => {
  const s: Session = (req as any).auth.session;
  const today = getTodayStr();
  if (OWNER_SET.has(s.role)) return res.json(banners);
  // Staff & members: only active, member-visible, unexpired banners for their branch
  const branchId = s.kind === 'member' ? members.find((m) => m.id === s.id)?.branch_id : profiles.find((p) => p.id === s.id)?.branch_id;
  res.json(
    banners.filter((b) => b.status === 'active' && b.visible_to_members && (!b.valid_until || b.valid_until >= today) && (!branchId || b.branch_ids.includes(branchId)))
  );
});

app.post('/api/banners', (req, res) => {
  const { input, error } = readBannerInput(req.body);
  if (!input) return res.status(400).json({ error });
  const c = req.body?.copy;
  const copy: BannerCopy = c && typeof c === 'object' && str(c.headline, 80)
    ? { headline: str(c.headline, 80), subline: str(c.subline, 110), body: str(c.body, 260), cta: str(c.cta, 50),
        kn: c.kn && typeof c.kn === 'object' ? { headline: str(c.kn.headline, 80), subline: str(c.kn.subline, 110), body: str(c.kn.body, 260), cta: str(c.kn.cta, 50) } : undefined }
    : templateCopy(input);
  const s: Session = (req as any).auth.session;
  const actor = profiles.find((p) => p.id === s.id);
  const valid_until = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.valid_until || '') ? req.body.valid_until : undefined;
  const rec: BannerRecord = {
    id: `bnr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: input.type, title: input.title, festival: input.festival, date: input.date, venue: input.venue, offer: input.offer, price: input.price,
    branch_ids: input.branch_ids, theme: input.theme, language: input.language || 'en', copy,
    status: 'active', visible_to_members: req.body?.visible_to_members !== false, valid_until,
    copy_source: req.body?.copy_source === 'ai' ? 'ai' : 'template', created_by: s.id, created_by_name: actor?.full_name || s.id, created_at: new Date().toISOString(),
  };
  banners.unshift(rec);
  if (banners.length > 500) banners.length = 500;
  res.status(201).json(rec);
});

app.put('/api/banners/:id', (req, res) => {
  const b = banners.find((x) => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'Banner not found' });
  if (req.body?.status === 'active' || req.body?.status === 'archived') b.status = req.body.status;
  if (typeof req.body?.visible_to_members === 'boolean') b.visible_to_members = req.body.visible_to_members;
  res.json(b);
});

// Reset Seed Data

app.post('/api/reset-seed', (req, res) => {
  initializeSeedData();
  res.json({ message: 'Database reset to Phase 2 seed state', memberCount: members.length });
});

// Delete member physically (Owner developer bypass)
app.delete('/api/members/:id', (req, res) => {
  const { id } = req.params;
  const initialLen = members.length;
  members = members.filter(m => m.id !== id);
  if (members.length === initialLen) {
    return res.status(404).json({ error: 'Member not found' });
  }
  res.json({ success: true, id });
});

// Durable storage: snapshot all collections to a JSON file (DATA_DIR) and restore on boot
var persistence: (ReturnType<typeof createPersistence> | ReturnType<typeof createSqliteStore>) | null = null;
const makeStore: any = process.env.STORAGE === 'json' ? createPersistence : createSqliteStore;
persistence = makeStore({
  dataDir: process.env.DATA_DIR || (isProduction() ? '/data' : path.join(process.cwd(), '.data')),
  enabled: process.env.PERSISTENCE !== 'off',
  snapshot: () => ({
    branches,
    profiles,
    members,
    attendanceLogs,
    staffAttendanceLogs,
    exportLogs,
    commissionSettlements,
    paymentHistory,
    crmActivities,
    leads,
    automationRules,
    automationLogs,
    auditLogs,
    freezeRequests,
    measurements,
    announcements,
    memberRiskScores,
    retentionAlerts,
    autoDebitAttempts,
    retentionOutreachLogs,
    staffNotifications,
    memberChurnPredictions,
    winbackCampaigns,
    winbackEnrollments,
    winbackAttempts,
    balanceReminderLogs,
    balanceReminderSettings,
    branchRotationLogs,
    msg91DltTemplates,
    branchSmsConfigs,
    pinHashes,
    banners,
    secretVault,
  }),
  restore: (data: any) => {
    if (data.branches !== undefined) branches = data.branches;
    if (data.profiles !== undefined) profiles = data.profiles;
    if (data.members !== undefined) members = data.members;
    if (data.attendanceLogs !== undefined) attendanceLogs = data.attendanceLogs;
    if (data.staffAttendanceLogs !== undefined) staffAttendanceLogs = data.staffAttendanceLogs;
    if (data.exportLogs !== undefined) exportLogs = data.exportLogs;
    if (data.commissionSettlements !== undefined) commissionSettlements = data.commissionSettlements;
    if (data.paymentHistory !== undefined) paymentHistory = data.paymentHistory;
    if (data.crmActivities !== undefined) crmActivities = data.crmActivities;
    if (data.leads !== undefined) leads = data.leads;
    if (data.automationRules !== undefined) automationRules = data.automationRules;
    if (data.automationLogs !== undefined) automationLogs = data.automationLogs;
    if (data.auditLogs !== undefined) auditLogs = data.auditLogs;
    if (data.freezeRequests !== undefined) freezeRequests = data.freezeRequests;
    if (data.measurements !== undefined) measurements = data.measurements;
    if (data.announcements !== undefined) announcements = data.announcements;
    if (data.memberRiskScores !== undefined) memberRiskScores = data.memberRiskScores;
    if (data.retentionAlerts !== undefined) retentionAlerts = data.retentionAlerts;
    if (data.autoDebitAttempts !== undefined) autoDebitAttempts = data.autoDebitAttempts;
    if (data.retentionOutreachLogs !== undefined) retentionOutreachLogs = data.retentionOutreachLogs;
    if (data.staffNotifications !== undefined) staffNotifications = data.staffNotifications;
    if (data.memberChurnPredictions !== undefined) memberChurnPredictions = data.memberChurnPredictions;
    if (data.winbackCampaigns !== undefined) winbackCampaigns = data.winbackCampaigns;
    if (data.winbackEnrollments !== undefined) winbackEnrollments = data.winbackEnrollments;
    if (data.winbackAttempts !== undefined) winbackAttempts = data.winbackAttempts;
    if (data.balanceReminderLogs !== undefined) balanceReminderLogs = data.balanceReminderLogs;
    if (data.balanceReminderSettings !== undefined) balanceReminderSettings = data.balanceReminderSettings;
    if (data.branchRotationLogs !== undefined) branchRotationLogs = data.branchRotationLogs;
    if (data.msg91DltTemplates !== undefined) msg91DltTemplates = data.msg91DltTemplates;
    if (data.branchSmsConfigs !== undefined) branchSmsConfigs = data.branchSmsConfigs;
    if (data.pinHashes !== undefined) pinHashes = data.pinHashes;
    if (data.banners !== undefined) banners = data.banners;
    if (data.secretVault !== undefined) secretVault = data.secretVault;
  },
});
persistence.load();
seedPins();
getSessionSecret();
getSecretsKey();

// Start Server with Vite Middleware
async function startServer() {
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Never serve server bundles or source maps from the web root
    app.use((req, res, next) => (/\.(cjs|map)$/i.test(req.path) ? res.status(404).end() : next()));
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders: (res, filePath) => {
          const base = path.basename(filePath);
          if (base === 'sw.js' || base === 'index.html' || base.endsWith('.webmanifest')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use(errorHandler);

  const server = app.listen(PORT, HOST, () => {
    console.log(`Pulse Fitness Phase 2 Server running at http://${HOST}:${PORT}`);
  });

  const shutdown = (signal: string) => {
    console.log(`[shutdown] ${signal} received, flushing data`);
    persistence?.flush();
    (persistence as any)?.close?.();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export { app };

if (process.env.VITEST) {
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
} else {
  startServer().catch((err) => {
    console.error('[fatal] failed to start server', err);
    process.exit(1);
  });
}
