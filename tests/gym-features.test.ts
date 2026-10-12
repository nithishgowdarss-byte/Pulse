import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { issuePass, verifyPass } from '../src/server/memberPass';

let app: Express;
const login = async (phone: string, pin: string) => {
  const a = request.agent(app);
  const r = await a.post('/api/auth/login').send({ phone, pin });
  expect(r.status, `login ${phone}`).toBe(200);
  return a;
};
let superA: any, trainerA: any, managerA: any, memberA: any;
let trainer: any, mine: any[], other: any, self: any, expiredMine: any;

beforeAll(async () => {
  ({ app } = (await import('../server')) as any);
  const { loginThrottle } = await import('../src/server/auth');
  loginThrottle.reset();
  superA = await login('9876543210', '1111');
  const profiles = (await superA.get('/api/profiles')).body;
  trainer = profiles.find((p: any) => p.id === 'usr_trainer_1');
  trainerA = await login(trainer.phone, '4444');
  managerA = await login('9822334455', '3333');
  const members = (await superA.get('/api/members')).body.filter((m: any) => !m.is_archived);
  const tb = trainer.assigned_branch_ids?.length ? trainer.assigned_branch_ids : [trainer.branch_id];
  mine = members.filter((m: any) => tb.includes(m.branch_id));
  other = members.find((m: any) => !tb.includes(m.branch_id));
  const today = new Date().toISOString().slice(0, 10);
  self = mine.find((m: any) => m.status === 'active' && (!m.end_date || m.end_date >= today) && members.filter((x: any) => x.phone === m.phone).length === 1);
  expiredMine = mine.find((m: any) => (m.status === 'expired' || (m.status === 'active' && m.end_date && m.end_date < today)) && members.filter((x: any) => x.phone === m.phone).length === 1);
  memberA = await login(self.phone, '5555');
});

describe('member pass tokens', () => {
  it('round-trips and rejects tampering/expiry', () => {
    const { token } = issuePass('s'.repeat(40), 'mem_1', 1_000_000_000_000);
    expect(verifyPass('s'.repeat(40), token, 1_000_000_000_001)).toEqual({ ok: true, memberId: 'mem_1' });
    expect(verifyPass('s'.repeat(40), token.replace('mem_1', 'mem_2'), 1_000_000_000_001)).toMatchObject({ ok: false, reason: 'BAD_SIGNATURE' });
    expect(verifyPass('x'.repeat(40), token, 1_000_000_000_001)).toMatchObject({ ok: false, reason: 'BAD_SIGNATURE' });
    expect(verifyPass('s'.repeat(40), token, 1_000_000_000_000 + 25 * 3600e3)).toMatchObject({ ok: false, reason: 'EXPIRED' });
    for (const bad of ['', 'hello', 'https://evil.example', null, 42, 'PULSE1.a.b.c', 'x'.repeat(500)]) expect(verifyPass('s'.repeat(40), bad).ok).toBe(false);
  });
});

describe('QR check-in', () => {
  it('member can fetch only their own pass and cannot self check-in', async () => {
    const r = await memberA.get(`/api/members/${self.id}/pass`);
    expect(r.status).toBe(200);
    expect(r.body.token).toMatch(/^PULSE1\./);
    expect((await memberA.get(`/api/members/${other.id}/pass`)).status).toBe(403);
    expect((await memberA.post('/api/attendance/check-in').send({ qr_token: r.body.token })).status).toBe(403);
  });

  it('trainer checks in via QR, duplicate is refused with a reason', async () => {
    const { token } = (await memberA.get(`/api/members/${self.id}/pass`)).body;
    const r = await trainerA.post('/api/attendance/check-in').send({ qr_token: token, checked_in_by: 'usr_owner_1' });
    expect(r.status, JSON.stringify(r.body).slice(0,300)).toBe(201);
    expect(r.body.record.method).toBe('qr');
    expect(r.body.record.checked_in_by).toBe(trainer.id); // not spoofable via body
    expect(Array.isArray(r.body.warnings)).toBe(true);
    const d = await trainerA.post('/api/attendance/check-in').send({ qr_token: token });
    expect(d.status).toBe(409);
    expect(d.body.code).toBe('ALREADY_CHECKED_IN');
  });

  it('rejects forged/garbage QR codes and other-branch members', async () => {
    for (const t of ['hello', 'PULSE1.mem_1.9999999999999.AAAAAAAAAAAAAAAAAAAAAA', '<script>']) {
      const r = await trainerA.post('/api/attendance/check-in').send({ qr_token: t });
      expect(r.status).toBe(400);
      expect(r.body.error).toBeTruthy();
    }
    const otherPass = (await superA.get(`/api/members/${other.id}/pass`)).body.token;
    const r = await trainerA.post('/api/attendance/check-in').send({ qr_token: otherPass });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('OTHER_BRANCH');
    expect((await trainerA.post('/api/attendance/check-in').send({})).body.code).toBe('MISSING_MEMBER');
  });

  it('expired membership needs explicit override', async () => {
    const { __testState } = (await import('../server')) as any;
    const live = __testState.members.find((x: any) => x.id === (expiredMine?.id ?? mine.find((y: any) => y.id !== self.id && mine.filter((z: any) => z.phone === y.phone).length === 1).id));
    live.status = 'active'; live.end_date = '2020-01-01';
    const m = live;
    const r = await trainerA.post('/api/attendance/check-in').send({ member_id: m.phone });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('MEMBERSHIP_EXPIRED');
    const o = await trainerA.post('/api/attendance/check-in').send({ member_id: m.phone, override: true });
    expect(o.status).toBe(201);
    expect(o.body.warnings.join(' ')).toMatch(/expired/i);
  });
});

describe('PT packages', () => {
  let pkgId: string;
  it('owner creates, validation gives reasons', async () => {
    const m = mine[0];
    expect((await superA.post('/api/pt-packages').send({ member_id: m.id, trainer_id: trainer.id, sessions_total: 0 })).status).toBe(400);
    expect((await superA.post('/api/pt-packages').send({ member_id: m.id, trainer_id: trainer.id, sessions_total: 'abc' })).status).toBe(400);
    expect((await superA.post('/api/pt-packages').send({ member_id: m.id, trainer_id: trainer.id, sessions_total: 5, price: -1 })).status).toBe(400);
    expect((await superA.post('/api/pt-packages').send({ member_id: m.id, trainer_id: trainer.id, sessions_total: 5, expires_on: '2001-01-01' })).status).toBe(400);
    expect((await superA.post('/api/pt-packages').send({ member_id: 'nope', trainer_id: trainer.id, sessions_total: 5 })).status).toBe(404);
    const r = await superA.post('/api/pt-packages').send({ member_id: m.id, trainer_id: trainer.id, sessions_total: 2, price: 4000 });
    expect(r.status).toBe(201);
    expect(r.body.package.sessions_left).toBe(2);
    pkgId = r.body.package.id;
  });
  it('trainer cannot create packages but can log sessions; exhaustion and duplicates refused', async () => {
    expect((await trainerA.post('/api/pt-packages').send({ member_id: mine[0].id, trainer_id: trainer.id, sessions_total: 5 })).status).toBe(403);
    const s1 = await trainerA.post(`/api/pt-packages/${pkgId}/sessions`).send({ notes: 'legs' });
    expect(s1.status).toBe(201);
    expect(s1.body.package.sessions_left).toBe(1);
    expect((await trainerA.post(`/api/pt-packages/${pkgId}/sessions`).send({})).body.code).toBe('PT_DUPLICATE');
    const sid = s1.body.package.sessions[0].id;
    expect((await trainerA.delete(`/api/pt-packages/${pkgId}/sessions/${sid}`)).status).toBe(403);
    expect((await superA.delete(`/api/pt-packages/${pkgId}/sessions/${sid}`)).status).toBe(200);
  });
  it('branch scoping: other-branch manager cannot touch, member sees only own', async () => {
    const otherPkg = (await superA.post('/api/pt-packages').send({ member_id: other.id, trainer_id: 'usr_owner_1', sessions_total: 3 })).body.package
      ?? (await superA.post('/api/pt-packages').send({ member_id: other.id, trainer_id: (await superA.get('/api/profiles')).body.find((p: any) => p.role === 'super_owner').id, sessions_total: 3 })).body.package;
    expect(otherPkg).toBeTruthy();
    expect((await trainerA.post(`/api/pt-packages/${otherPkg.id}/sessions`).send({})).status).toBe(403);
    const tl = (await trainerA.get('/api/pt-packages')).body.packages;
    expect(tl.some((p: any) => p.id === otherPkg.id)).toBe(false);
    const ml = (await memberA.get('/api/pt-packages')).body.packages;
    expect(ml.every((p: any) => p.member_id === self.id)).toBe(true);
    const mgr = (await managerA.get('/api/pt-packages')).body.packages;
    expect(mgr.every((p: any) => p.branch_id === 'br_rr_2')).toBe(true);
  });
});

describe('dues targets', () => {
  it('reports skipped members instead of silently dropping them; trainers denied', async () => {
    const r = await superA.get('/api/balance-reminders/targets');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.invalid_phone)).toBe(true);
    expect(typeof r.body.in_cooldown).toBe('number');
    expect((await trainerA.get('/api/balance-reminders/targets')).status).toBe(403);
    expect((await superA.post('/api/balance-reminders/log').send({ member_id: 'ghost' })).status).toBe(404);
  });
});

describe('member create input validation', () => {
  it('rejects bad phones / names / branches with a reason', async () => {
    for (const phone of ['12345', 'abcdefghij', '0123456789', '5555555555']) {
      const r = await superA.post('/api/members').send({ full_name: 'Odd Input', phone, branch_id: 'br_nag_1' });
      expect(r.status, phone).toBe(400);
      expect(r.body.error).toMatch(/mobile/i);
    }
    expect((await superA.post('/api/members').send({ full_name: 'x'.repeat(500), phone: '9123456780', branch_id: 'br_nag_1' })).status).toBe(400);
    expect((await superA.post('/api/members').send({ full_name: 'Ghost', phone: '9123456780', branch_id: 'br_nope' })).status).toBe(400);
    expect((await superA.post('/api/members').send({ full_name: 'Num Phone', phone: 9123456781, branch_id: 'br_nag_1' })).status).toBe(201);
  });
  it('trainer cannot attribute onboarding to someone else', async () => {
    const r = await trainerA.post('/api/members').send({ full_name: 'Attrib Test', phone: '9123456782', onboarded_by: 'usr_trainer_5' });
    expect(r.status).toBe(201);
    expect((r.body.member || r.body).onboarded_by).toBe(trainer.id);
  });
});
