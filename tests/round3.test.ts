import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

let app: any; let superA: any, ownerA: any, managerA: any, trainerA: any, memberA: any, self: any, other: any;
const login = async (phone: string, pin: string) => { const a = request.agent(app); const r = await a.post('/api/auth/login').send({ phone, pin }); expect(r.status, `login ${phone}`).toBe(200); return a; };
const month = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7);
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

beforeAll(async () => {
  ({ app } = (await import('../server')) as any);
  (await import('../src/server/auth')).loginThrottle.reset();
  superA = await login('9876543210', '1111');
  managerA = await login('9822334455', '3333');
  trainerA = await login('9812345671', '4444');
  const members = (await superA.get('/api/members')).body.filter((m: any) => !m.is_archived);
  self = members.find((m: any) => m.phone === '9876001122');
  other = members.find((m: any) => m.id !== self.id && m.branch_id !== 'br_rr_2');
  memberA = await login('9876001122', '5555');
});

describe('authz for round 3 routes', () => {
  it('only super owner can back up / restore', async () => {
    for (const a of [managerA, trainerA, memberA]) {
      expect((await a.get('/api/admin/backup')).status).toBe(403);
      expect((await a.post('/api/admin/restore/confirm').send({ token: 'x', confirm: 'RESTORE' })).status).toBe(403);
    }
  });
  it('trainer and member cannot see expenses or reports', async () => {
    for (const a of [trainerA, memberA]) {
      expect((await a.get('/api/expenses')).status).toBe(403);
      expect((await a.get(`/api/reports/monthly?month=${month}`)).status).toBe(403);
    }
  });
  it('restore confirm requires typed RESTORE and a valid token', async () => {
    expect((await superA.post('/api/admin/restore/confirm').send({ token: 'x' })).status).toBe(400);
    expect((await superA.post('/api/admin/restore/confirm').send({ token: 'nope', confirm: 'RESTORE' })).status).toBeGreaterThanOrEqual(400);
  });
  it('restore validate rejects garbage files with a reason', async () => {
    const r = await superA.post('/api/admin/restore/validate').set('Content-Type', 'application/octet-stream').send(Buffer.from('not a database 😀 ಕನ್ನಡ'));
    expect(r.status).toBe(400); expect(String(r.body.error)).toMatch(/\w/);
  });
});

describe('expenses', () => {
  it('validates input and scopes manager to own branch', async () => {
    for (const bad of [{ amount: -5 }, { amount: 'abc' }, { amount: 1e12 }, { date: '2999-01-01' }, { category: 'Bitcoin' }]) {
      const r = await superA.post('/api/expenses').send({ branch_id: 'br_nag_1', category: 'Rent', amount: 45000, date: today, ...bad });
      expect(r.status, JSON.stringify(bad)).toBe(400);
    }
    const ok = await superA.post('/api/expenses').send({ branch_id: 'br_nag_1', category: 'Electricity', amount: 8240, date: today, note: 'BESCOM ಬಿಲ್ 💡' });
    expect(ok.status).toBe(201);
    expect((await managerA.post('/api/expenses').send({ branch_id: 'br_nag_1', category: 'Rent', amount: 100, date: today })).status).toBe(403);
    expect((await managerA.post('/api/expenses').send({ branch_id: 'br_rr_2', category: 'Water', amount: 1200, date: today })).status).toBe(201);
    const list = (await managerA.get('/api/expenses')).body.expenses;
    expect(list.every((e: any) => e.branch_id === 'br_rr_2')).toBe(true);
    expect((await managerA.delete(`/api/expenses/${ok.body.expense.id}`)).status).toBe(403);
  });
});

describe('monthly report', () => {
  it('returns branch/plan/method/churn breakdown and validates month', async () => {
    expect((await superA.get('/api/reports/monthly?month=2026-13')).status).toBe(400);
    const r = await superA.get(`/api/reports/monthly?month=${month}`);
    expect(r.status).toBe(200);
    for (const k of ['branches', 'by_plan', 'by_method', 'attendance_trend', 'churn']) expect(r.body).toHaveProperty(k);
    const nag = r.body.branches.find((b: any) => b.branch_id === 'br_nag_1');
    expect(nag.expenses).toBeGreaterThanOrEqual(8240);
    const m = (await managerA.get(`/api/reports/monthly?month=${month}`)).body;
    expect(m.branches.every((b: any) => b.branch_id === 'br_rr_2')).toBe(true);
  });
});

describe('privacy (DPDP)', () => {
  it('consent, own export only, delete request flow', async () => {
    expect((await memberA.get('/api/privacy/me')).status).toBe(200);
    expect((await memberA.post('/api/privacy/consent').send({ accepted: false })).status).toBe(400);
    expect((await memberA.post('/api/privacy/consent').send({ accepted: true })).status).toBe(200);
    expect((await memberA.get('/api/privacy/me')).body.consent?.version).toBeTruthy();
    const ex = await memberA.get('/api/privacy/export');
    expect(ex.status).toBe(200); expect(JSON.stringify(ex.body)).toContain(self.id);
    expect(JSON.stringify(ex.body)).not.toMatch(/pin_?hash|scrypt/i);
    expect((await memberA.get(`/api/privacy/export?member_id=${other.id}`)).body?.member?.id ?? self.id).toBe(self.id);
    expect((await managerA.get(`/api/privacy/export?member_id=${self.id}`)).status).toBe(403);
    const rq = await memberA.post('/api/privacy/requests').send({ reason: 'Moving city' });
    expect(rq.status).toBe(201);
    expect((await managerA.post(`/api/privacy/requests/${rq.body.request.id}/resolve`).send({ action: 'reject', note: 'x' })).status).toBe(403);
    expect((await superA.post(`/api/privacy/requests/${rq.body.request.id}/resolve`).send({ action: 'reject' })).status).toBe(400);
    expect((await superA.post(`/api/privacy/requests/${rq.body.request.id}/resolve`).send({ action: 'reject', note: 'Active PT contract until month end' })).status).toBe(200);
  });
});

describe('member self-renew request', () => {
  it('member requests, desk must record payment before confirming', async () => {
    expect((await memberA.post('/api/renew-requests').send({ months: 2 })).status).toBe(400);
    const r = await memberA.post('/api/renew-requests').send({ months: 3, note: 'UPI at desk 🙏' });
    expect(r.status).toBe(201);
    expect((await memberA.post('/api/renew-requests').send({ months: 1 })).status).toBe(409);
    expect((await memberA.post(`/api/renew-requests/${r.body.request.id}/resolve`).send({ status: 'confirmed' })).status).toBe(403);
    expect((await superA.post(`/api/renew-requests/${r.body.request.id}/resolve`).send({ status: 'confirmed' })).status).toBe(409);
    expect((await superA.post(`/api/renew-requests/${r.body.request.id}/resolve`).send({ status: 'rejected' })).status).toBe(400);
    expect((await memberA.post(`/api/renew-requests/${r.body.request.id}/resolve`).send({ status: 'cancelled' })).status).toBe(200);
  });
});

describe('sqlite backup + validation', () => {
  it('backs up, validates and rejects corrupted/truncated files', async () => {
    const { createSqliteStore, validateBackupFile } = await import('../src/server/sqliteStore') as any;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-bk-'));
    const st = createSqliteStore({ dataDir: dir, snapshot: () => ({ branches: [{ id: 'b' }], profiles: [{ id: 'p' }], members: [{ id: 'm', full_name: 'ಅನಿಲ್', branch_id: 'b' }] }), restore: () => {} });
    st.markDirty?.(); st.flush();
    const f = path.join(dir, 'bk.db'); st.backup(f);
    const v = validateBackupFile(f, 99); expect(v.ok, v.error).toBe(true); expect(v.summary.members).toBe(1);
    const bad = path.join(dir, 'bad.db'); fs.writeFileSync(bad, fs.readFileSync(f).subarray(0, 200));
    expect(validateBackupFile(bad, 99).ok).toBe(false);
    expect(validateBackupFile(f, 0).ok).toBe(false); // schema newer than app
  });
});
