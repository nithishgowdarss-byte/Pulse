// Round 3 gym-ops features: backup/restore, DPDP privacy, expenses, member renew requests, owner reports.
import type { Express, Request, Response } from 'express';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { validateBackupFile } from './sqliteStore';

export interface Expense { id: string; branch_id: string; category: string; amount: number; date: string; note?: string; created_by: string; created_at: string }
export interface RenewRequest { id: string; member_id: string; member_name: string; branch_id: string; months: number; package_type?: string; note?: string; status: 'pending' | 'confirmed' | 'rejected' | 'cancelled'; created_at: string; resolved_by?: string; resolved_at?: string; resolution_note?: string }
export interface PrivacyRequest { id: string; member_id: string; member_name: string; branch_id: string; type: 'delete'; reason?: string; status: 'pending' | 'completed' | 'rejected'; created_at: string; resolved_by?: string; resolved_at?: string; note?: string }
export interface Consent { member_id: string; version: string; accepted_at: string }
export const CONSENT_VERSION = '2026-10';
export const EXPENSE_CATEGORIES = ['Rent', 'Salaries', 'Electricity', 'Water', 'Equipment', 'Maintenance', 'Marketing', 'Cleaning', 'Supplements stock', 'Other'];

export interface Round3State { expenses: Expense[]; renewRequests: RenewRequest[]; privacyRequests: PrivacyRequest[]; consents: Record<string, Consent> }
export interface Round3Deps {
  state: () => Round3State;
  members: () => any[]; profiles: () => any[]; branches: () => any[]; payments: () => any[]; attendance: () => any[];
  measurements: () => any[]; freezeRequests: () => any[]; ptPackages: () => any[];
  pinHashes: () => Record<string, string>;
  audit: (entry: Record<string, any>) => void;
  gymDate: (ms?: number) => string;
  store: any; dataDir: string;
  markDirty: () => void;
}

const sess = (req: Request) => (req as any).auth?.session as { id: string; role: string } | undefined;
const scope = (req: Request) => (req as any).auth?.branchIds as string[] | null | undefined;
const isOwner = (r?: string) => r === 'super_owner' || r === 'owner';
const rid = (p: string) => `${p}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function round3EntityBranch(d: Round3Deps, p: string): string | undefined {
  let m: RegExpMatchArray | null;
  const s = d.state();
  if ((m = p.match(/^\/api\/expenses\/([^/]+)$/))) return s.expenses.find((x) => x.id === m![1])?.branch_id ?? '';
  if ((m = p.match(/^\/api\/renew-requests\/([^/]+)(\/.*)?$/))) return s.renewRequests.find((x) => x.id === m![1])?.branch_id ?? '';
  if ((m = p.match(/^\/api\/privacy\/requests\/([^/]+)(\/.*)?$/))) return s.privacyRequests.find((x) => x.id === m![1])?.branch_id ?? '';
  return undefined;
}

export function registerRound3(app: Express, d: Round3Deps) {
  // ---------- Backup / restore (super owner only; enforced again in authorize) ----------
  const uploads = path.join(d.dataDir, 'restore-uploads');
  app.get('/api/admin/backup', (req, res) => {
    if (!d.store?.backup) return res.status(503).json({ error: 'Backups need SQLite storage (STORAGE=json or persistence off).' });
    try {
      const file = path.join(d.dataDir, 'backups', `pulse-backup-${d.gymDate()}-${Date.now()}.db`);
      const out = d.store.backup(file);
      d.audit({ actor_id: sess(req)?.id, action: 'admin.backup.download', entity_type: 'database', entity_id: path.basename(file) });
      res.setHeader('Cache-Control', 'no-store');
      res.download(out.file, `pulse-backup-${d.gymDate()}.db`, () => { try { fs.unlinkSync(out.file); } catch {} });
    } catch (e: any) { res.status(500).json({ error: `Backup failed: ${e.message}` }); }
  });
  app.post('/api/admin/restore/validate', express.raw({ type: () => true, limit: '200mb' }), (req, res) => {
    if (!d.store?.restoreFrom) return res.status(503).json({ error: 'Restore needs SQLite storage.' });
    const buf: Buffer = req.body;
    if (!Buffer.isBuffer(buf) || buf.length < 100) return res.status(400).json({ error: 'Choose a Pulse backup (.db) file to upload.' });
    fs.mkdirSync(uploads, { recursive: true });
    const token = crypto.randomBytes(16).toString('hex');
    const file = path.join(uploads, `${token}.db`);
    fs.writeFileSync(file, buf, { mode: 0o600 });
    const check = validateBackupFile(file);
    if (!check.ok) { try { fs.unlinkSync(file); } catch {} return res.status(400).json({ error: check.error, code: 'INVALID_BACKUP' }); }
    // stale uploads older than 1h are removed
    for (const f of fs.readdirSync(uploads)) { const fp = path.join(uploads, f); try { if (Date.now() - fs.statSync(fp).mtimeMs > 3600e3) fs.unlinkSync(fp); } catch {} }
    const cur = { members: d.members().length, branches: d.branches().length, profiles: d.profiles().length, payments: d.payments().length };
    res.json({ token, summary: check.summary, schema: check.schemaVersion, current: cur });
  });
  app.post('/api/admin/restore/confirm', (req, res) => {
    const { token, confirm } = req.body || {};
    if (confirm !== 'RESTORE') return res.status(400).json({ error: 'Type RESTORE to confirm. This replaces all current data.' });
    if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) return res.status(400).json({ error: 'Upload and validate a backup first.' });
    const file = path.join(uploads, `${token}.db`);
    if (!fs.existsSync(file)) return res.status(410).json({ error: 'That upload expired. Upload the backup again.' });
    const check = validateBackupFile(file);
    if (!check.ok) return res.status(400).json({ error: check.error });
    const keep = path.join(d.dataDir, 'backups', `pre-restore-${Date.now()}.db`);
    try { d.store.restoreFrom(check.data, keep); }
    catch (e: any) { return res.status(500).json({ error: `Restore failed, nothing changed: ${e.message}` }); }
    try { fs.unlinkSync(file); } catch {}
    d.audit({ actor_id: sess(req)?.id, action: 'admin.restore', entity_type: 'database', entity_id: path.basename(keep) });
    res.json({ success: true, restored: check.summary, previous_copy: path.basename(keep), note: 'Everyone may need to sign in again if PINs changed.' });
  });

  // ---------- DPDP privacy ----------
  app.get('/api/privacy/me', (req, res) => {
    const s = sess(req)!;
    if (s.role !== 'member') return res.status(400).json({ error: 'Only members have privacy settings here.' });
    res.json({ consent: d.state().consents[s.id] || null, current_version: CONSENT_VERSION, requests: d.state().privacyRequests.filter((r) => r.member_id === s.id) });
  });
  app.post('/api/privacy/consent', (req, res) => {
    const s = sess(req)!;
    if (s.role !== 'member') return res.status(400).json({ error: 'Only members give consent.' });
    if (req.body?.accepted !== true) return res.status(400).json({ error: 'Tick the box to agree, or sign out.' });
    d.state().consents[s.id] = { member_id: s.id, version: CONSENT_VERSION, accepted_at: new Date().toISOString() };
    d.audit({ actor_id: s.id, action: 'privacy.consent', entity_type: 'member', entity_id: s.id });
    res.json({ consent: d.state().consents[s.id] });
  });
  app.get('/api/privacy/export', (req, res) => {
    const s = sess(req)!;
    const id = s.role === 'member' ? s.id : String(req.query.member_id || '');
    if (s.role !== 'member' && !isOwner(s.role)) return res.status(403).json({ error: 'Only the member or an owner can export member data.' });
    const m = d.members().find((x) => x.id === id);
    if (!m) return res.status(404).json({ error: 'Member not found' });
    const by = (arr: any[]) => arr.filter((x) => x.member_id === id);
    const data = {
      exported_at: new Date().toISOString(), notice: 'Your personal data held by Pulse Fitness (Digital Personal Data Protection Act, 2023).',
      profile: m, consent: d.state().consents[id] || null, payments: by(d.payments()), attendance: by(d.attendance()), measurements: by(d.measurements()),
      freeze_requests: by(d.freezeRequests()), pt_packages: by(d.ptPackages()), renew_requests: by(d.state().renewRequests), privacy_requests: by(d.state().privacyRequests),
    };
    d.audit({ actor_id: s.id, action: 'privacy.export', entity_type: 'member', entity_id: id });
    res.setHeader('Content-Disposition', `attachment; filename="pulse-my-data-${d.gymDate()}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  });
  app.post('/api/privacy/requests', (req, res) => {
    const s = sess(req)!;
    if (s.role !== 'member') return res.status(400).json({ error: 'Members raise deletion requests from their own app.' });
    const m = d.members().find((x) => x.id === s.id)!;
    if (d.state().privacyRequests.some((r) => r.member_id === s.id && r.status === 'pending')) return res.status(409).json({ error: 'You already have a pending deletion request.' });
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
    const r: PrivacyRequest = { id: rid('prv'), member_id: s.id, member_name: m.full_name, branch_id: m.branch_id, type: 'delete', reason: reason || undefined, status: 'pending', created_at: new Date().toISOString() };
    d.state().privacyRequests.unshift(r);
    d.audit({ actor_id: s.id, action: 'privacy.delete_requested', entity_type: 'member', entity_id: s.id });
    res.status(201).json({ request: r });
  });
  app.get('/api/privacy/requests', (req, res) => {
    let list = [...d.state().privacyRequests];
    const sc = scope(req); if (sc) list = list.filter((r) => sc.includes(r.branch_id));
    res.json({ requests: list });
  });
  app.post('/api/privacy/requests/:id/resolve', (req, res) => {
    const s = sess(req)!;
    if (!isOwner(s.role)) return res.status(403).json({ error: 'Only owners can resolve data deletion requests.' });
    const r = d.state().privacyRequests.find((x) => x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found' });
    if (r.status !== 'pending') return res.status(409).json({ error: `Already ${r.status}.` });
    const action = req.body?.action;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
    if (action === 'reject') {
      if (!note) return res.status(400).json({ error: 'Give the member a reason when rejecting.' });
      Object.assign(r, { status: 'rejected', note, resolved_by: s.id, resolved_at: new Date().toISOString() });
      return res.json({ request: r });
    }
    if (action !== 'approve') return res.status(400).json({ error: 'action must be approve or reject' });
    const m = d.members().find((x) => x.id === r.member_id);
    if (!m) return res.status(404).json({ error: 'Member already removed' });
    if ((Number(m.balance_due) || 0) > 0 && req.body?.waive_dues !== true) return res.status(409).json({ error: `Member owes ₹${m.balance_due}. Collect or waive dues first (tick “waive dues”).`, code: 'DUES_PENDING' });
    // Anonymise personal data; keep financial records (tax/accounting retention) without identity.
    const anon = `Deleted member ${m.id.slice(-4)}`;
    Object.assign(m, { full_name: anon, phone: '', raw_phone: '', email: undefined, emergency_contact: undefined, notes: undefined, age: undefined, gender: undefined, avatar: undefined, is_archived: true, balance_due: 0, anonymized_at: new Date().toISOString() });
    for (const p of d.payments()) if (p.member_id === m.id) { p.member_name = anon; delete p.member_phone; }
    for (const a of d.attendance()) if (a.member_id === m.id) a.member_name = anon;
    const ms = d.measurements(); for (let i = ms.length - 1; i >= 0; i--) if (ms[i].member_id === m.id) ms.splice(i, 1);
    delete d.pinHashes()[m.id];
    delete d.state().consents[m.id];
    for (const pr of d.state().privacyRequests) if (pr.member_id === m.id) pr.member_name = anon;
    Object.assign(r, { status: 'completed', note: note || undefined, resolved_by: s.id, resolved_at: new Date().toISOString() });
    d.audit({ actor_id: s.id, action: 'privacy.member_anonymized', entity_type: 'member', entity_id: m.id });
    res.json({ request: r });
  });

  // ---------- Expenses (owners + branch managers) ----------
  app.get('/api/expenses', (req, res) => {
    const { branch_id, month } = req.query as Record<string, string | undefined>;
    let list = [...d.state().expenses];
    const sc = scope(req); if (sc) list = list.filter((e) => sc.includes(e.branch_id));
    if (branch_id && branch_id !== 'all') list = list.filter((e) => e.branch_id === branch_id);
    if (month && MONTH.test(month)) list = list.filter((e) => e.date.startsWith(month));
    list.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
    res.json({ expenses: list, total: list.reduce((s, e) => s + e.amount, 0), categories: EXPENSE_CATEGORIES });
  });
  app.post('/api/expenses', (req, res) => {
    const s = sess(req)!;
    const { branch_id, category, amount, date, note } = req.body || {};
    if (!d.branches().some((b) => b.id === branch_id)) return res.status(400).json({ error: 'Pick a branch.' });
    if (!EXPENSE_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Pick a category.' });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0 || amt > 10000000) return res.status(400).json({ error: 'Amount must be between ₹1 and ₹1,00,00,000.' });
    const dt = typeof date === 'string' && DATE.test(date) && !isNaN(Date.parse(date)) ? date : '';
    if (!dt) return res.status(400).json({ error: 'Enter a valid date.' });
    if (dt > d.gymDate()) return res.status(400).json({ error: 'Expense date cannot be in the future.' });
    const e: Expense = { id: rid('exp'), branch_id, category, amount: Math.round(amt * 100) / 100, date: dt, note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 300) : undefined, created_by: s.id, created_at: new Date().toISOString() };
    d.state().expenses.unshift(e);
    d.audit({ actor_id: s.id, action: 'expense.create', entity_type: 'expense', entity_id: e.id, branch_id });
    res.status(201).json({ expense: e });
  });
  app.delete('/api/expenses/:id', (req, res) => {
    const st = d.state(); const i = st.expenses.findIndex((e) => e.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: 'Expense not found' });
    const [e] = st.expenses.splice(i, 1);
    d.audit({ actor_id: sess(req)?.id, action: 'expense.delete', entity_type: 'expense', entity_id: e.id, branch_id: e.branch_id });
    res.json({ success: true });
  });

  // ---------- Member self-renew request (desk confirms; no payment gateway) ----------
  app.post('/api/renew-requests', (req, res) => {
    const s = sess(req)!;
    if (s.role !== 'member') return res.status(400).json({ error: 'Renewal requests come from the member app; staff use Renew directly.' });
    const m = d.members().find((x) => x.id === s.id)!;
    const months = Number(req.body?.months);
    if (![1, 3, 6, 12].includes(months)) return res.status(400).json({ error: 'Choose 1, 3, 6 or 12 months.' });
    if (d.state().renewRequests.some((r) => r.member_id === s.id && r.status === 'pending')) return res.status(409).json({ error: 'You already have a pending renewal request. The front desk will confirm it when you pay.' });
    const r: RenewRequest = { id: rid('rnw'), member_id: s.id, member_name: m.full_name, branch_id: m.branch_id, months, package_type: typeof req.body?.package_type === 'string' ? req.body.package_type.slice(0, 60) : m.package_type, note: typeof req.body?.note === 'string' && req.body.note.trim() ? req.body.note.trim().slice(0, 300) : undefined, status: 'pending', created_at: new Date().toISOString() };
    d.state().renewRequests.unshift(r);
    res.status(201).json({ request: r });
  });
  app.get('/api/renew-requests', (req, res) => {
    let list = [...d.state().renewRequests];
    const s = sess(req)!;
    if (s.role === 'member') list = list.filter((r) => r.member_id === s.id);
    const sc = scope(req); if (sc && s.role !== 'member') list = list.filter((r) => sc.includes(r.branch_id));
    if (req.query.status) list = list.filter((r) => r.status === req.query.status);
    res.json({ requests: list });
  });
  app.post('/api/renew-requests/:id/resolve', (req, res) => {
    const s = sess(req)!;
    const r = d.state().renewRequests.find((x) => x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found' });
    if (s.role === 'member') {
      if (r.member_id !== s.id || req.body?.status !== 'cancelled') return res.status(403).json({ error: 'Members can only cancel their own request.' });
    }
    if (r.status !== 'pending') return res.status(409).json({ error: `Already ${r.status}.` });
    const status = req.body?.status;
    if (!['confirmed', 'rejected', 'cancelled'].includes(status)) return res.status(400).json({ error: 'status must be confirmed, rejected or cancelled' });
    if (status === 'confirmed') {
      const paid = d.payments().some((p) => p.member_id === r.member_id && p.entry_type === 'renewal' && p.created_at >= r.created_at);
      if (!paid) return res.status(409).json({ error: 'Record the renewal payment first (Renew), then confirm.', code: 'NO_RENEWAL_PAYMENT' });
    }
    if (status === 'rejected' && !(typeof req.body?.note === 'string' && req.body.note.trim())) return res.status(400).json({ error: 'Tell the member why (note).' });
    Object.assign(r, { status, resolved_by: s.id, resolved_at: new Date().toISOString(), resolution_note: typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : undefined });
    res.json({ request: r });
  });

  // ---------- Owner reports ----------
  app.get('/api/reports/monthly', (req, res) => {
    if (req.query.month !== undefined && !(typeof req.query.month === 'string' && MONTH.test(req.query.month) && Number(req.query.month.slice(5)) >= 1 && Number(req.query.month.slice(5)) <= 12)) return res.status(400).json({ error: 'month must be YYYY-MM' });
    const month = typeof req.query.month === 'string' && MONTH.test(req.query.month) ? req.query.month : d.gymDate().slice(0, 7);
    let branchIds = d.branches().map((b) => b.id);
    const sc = scope(req); if (sc) branchIds = branchIds.filter((b) => sc.includes(b));
    const bq = req.query.branch_id; if (typeof bq === 'string' && bq !== 'all') branchIds = branchIds.filter((b) => b === bq);
    const inScope = (b?: string) => !!b && branchIds.includes(b);
    const memberBranch = new Map(d.members().map((m) => [m.id, m.branch_id]));
    const pays = d.payments().filter((p) => {
      const date = p.entry_date || d.gymDate(Date.parse(p.created_at));
      const method = String(p.payment_method || '').toLowerCase();
      return date.startsWith(month) && inScope(p.branch_id || memberBranch.get(p.member_id)) && method !== 'adjusted' && p.entry_type !== 'freeze';
    });
    const sum = (arr: any[]) => arr.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const group = (key: (p: any) => string) => { const m = new Map<string, number>(); for (const p of pays) m.set(key(p), (m.get(key(p)) || 0) + (Number(p.amount) || 0)); return [...m].map(([k, v]) => ({ key: k, amount: v })).sort((a, b) => b.amount - a.amount); };
    const methodOf = (p: any) => { const x = String(p.payment_method || '').toLowerCase(); return /upi|gpay|phonepe|bhim/.test(x) ? 'UPI' : /cash/.test(x) ? 'Cash' : /card|pos/.test(x) ? 'Card' : /bank|neft|imps/.test(x) ? 'Bank transfer' : 'Other'; };
    const bname = (id: string) => d.branches().find((b) => b.id === id)?.name?.replace('Pulse Fitness - ', '') || id;
    const exps = d.state().expenses.filter((e) => e.date.startsWith(month) && inScope(e.branch_id));
    const byBranch = branchIds.map((id) => {
      const rev = sum(pays.filter((p) => (p.branch_id || memberBranch.get(p.member_id)) === id));
      const ex = exps.filter((e) => e.branch_id === id).reduce((s, e) => s + e.amount, 0);
      return { branch_id: id, branch: bname(id), revenue: rev, expenses: ex, net: rev - ex };
    });
    // attendance trend per day
    const [y, mo] = month.split('-').map(Number);
    const days = new Date(y, mo, 0).getDate();
    const att = d.attendance().filter((a) => inScope(a.branch_id || memberBranch.get(a.member_id)));
    const trend = Array.from({ length: days }, (_, i) => {
      const day = `${month}-${String(i + 1).padStart(2, '0')}`;
      return { day, checkins: att.filter((a) => d.gymDate(Date.parse(a.checked_in_at)) === day).length };
    });
    // churn: memberships that ended this month and were not renewed (still expired / not extended past month)
    const mems = d.members().filter((m) => inScope(m.branch_id) && !m.anonymized_at);
    const monthEnd = `${month}-${String(days).padStart(2, '0')}`;
    const endedInMonth = mems.filter((m) => m.end_date && m.end_date.startsWith(month));
    const today = d.gymDate();
    const churned = endedInMonth.filter((m) => m.end_date < today);
    const activeAtStart = mems.filter((m) => m.start_date && m.start_date < `${month}-01` && m.end_date && m.end_date >= `${month}-01`).length;
    const newMembers = mems.filter((m) => m.start_date && m.start_date.startsWith(month)).length;
    res.json({
      month, branches: byBranch,
      totals: { revenue: sum(pays), expenses: exps.reduce((s, e) => s + e.amount, 0), net: sum(pays) - exps.reduce((s, e) => s + e.amount, 0), payments: pays.length, checkins: trend.reduce((s, t) => s + t.checkins, 0), new_members: newMembers },
      by_plan: group((p) => p.package_type || d.members().find((m) => m.id === p.member_id)?.package_type || 'Unknown'),
      by_method: group(methodOf),
      by_type: group((p) => p.entry_type || 'other'),
      expenses_by_category: Object.entries(exps.reduce((a: Record<string, number>, e) => ((a[e.category] = (a[e.category] || 0) + e.amount), a), {})).map(([key, amount]) => ({ key, amount })).sort((a, b) => b.amount - a.amount),
      attendance_trend: trend,
      churn: { ended_this_month: endedInMonth.length, not_renewed: churned.length, active_at_start: activeAtStart, rate_pct: Math.max(activeAtStart, endedInMonth.length) ? Math.round((churned.length / Math.max(activeAtStart, endedInMonth.length)) * 1000) / 10 : 0, month_end: monthEnd,
        members: churned.slice(0, 200).map((m) => ({ id: m.id, full_name: m.full_name, phone: m.phone, end_date: m.end_date, branch: bname(m.branch_id), package_type: m.package_type })) },
    });
  });
}
