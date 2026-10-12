import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

let app: Express;
const login = async (phone: string, pin: string) => {
  const a = request.agent(app);
  const r = await a.post('/api/auth/login').send({ phone, pin });
  expect(r.status, `login ${phone}`).toBe(200);
  return { agent: a, me: r.body };
};
let superA: any, ownerA: any, trainerA: any, memberA: any, managerA: any;
let trainer: any, memberSelf: any, memberSameBranch: any, memberOtherBranch: any;

beforeAll(async () => {
  ({ app } = (await import('../server')) as any);
  const { loginThrottle } = await import('../src/server/auth');
  loginThrottle.reset();
  superA = (await login('9876543210', '1111')).agent;
  ownerA = (await login('9876543210', '2222')).agent;
  const profiles = (await superA.get('/api/profiles')).body;
  trainer = profiles.find((p: any) => p.id === 'usr_trainer_1');
  const manager = profiles.find((p: any) => p.id === 'usr_manager_1');
  trainerA = (await login(trainer.phone, '4444')).agent;
  managerA = (await login(manager.phone, '3333')).agent;
  const members = (await superA.get('/api/members')).body;
  const tb = trainer.assigned_branch_ids?.length ? trainer.assigned_branch_ids : [trainer.branch_id];
  memberSameBranch = members.find((m: any) => tb.includes(m.branch_id));
  memberOtherBranch = members.find((m: any) => !tb.includes(m.branch_id));
  memberSelf = memberOtherBranch;
  const phoneOwners = members.filter((m: any) => m.phone === memberSelf.phone);
  expect(phoneOwners.length).toBe(1);
  memberA = (await login(memberSelf.phone, '5555')).agent;
});

describe('authentication', () => {
  it('rejects unauthenticated API access', async () => {
    for (const p of ['/api/members', '/api/profiles', '/api/payments', '/v1/models']) {
      expect((await request(app).get(p)).status, p).toBe(401);
    }
  });
  it('health stays public', async () => {
    expect((await request(app).get('/healthz')).status).toBe(200);
  });
  it('sets an httpOnly SameSite cookie on login', async () => {
    const r = await request(app).post('/api/auth/login').send({ phone: '9876543210', pin: '1111' });
    const c = String(r.headers['set-cookie']);
    expect(c).toMatch(/pulse_session=/);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Strict/);
  });
  it('a tampered cookie is rejected', async () => {
    const r = await request(app).post('/api/auth/login').send({ phone: '9876543210', pin: '2222' });
    const token = String(r.headers['set-cookie']).match(/pulse_session=([^;]+)/)![1];
    const [payload, sig] = decodeURIComponent(token).split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), role: 'super_owner' })).toString('base64url');
    expect((await request(app).get('/api/auth/me').set('Cookie', `pulse_session=${forged}.${sig}`)).body.profile).toBeNull();
    expect((await request(app).get('/api/members').set('Cookie', `pulse_session=${forged}.${sig}`)).status).toBe(401);
  });
  it('wrong PIN is rejected and repeated failures lock the account', async () => {
    const { loginThrottle } = await import('../src/server/auth');
    loginThrottle.reset();
    for (let i = 0; i < 5; i++) expect((await request(app).post('/api/auth/login').send({ phone: '9812300000', pin: '0000' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ phone: '9812300000', pin: '0000' })).status).toBe(429);
    loginThrottle.reset();
  });
  it('logout clears the session cookie', async () => {
    const r = await request(app).post('/api/auth/logout');
    expect(String(r.headers['set-cookie'])).toMatch(/Max-Age=0/);
  });
  it('/api/auth/me returns the right role', async () => {
    expect((await trainerA.get('/api/auth/me')).body.profile.role).toBe('trainer');
    expect((await memberA.get('/api/auth/me')).body.profile.role).toBe('member');
  });
  it('PIN hashes never appear in API output', async () => {
    const r = await superA.get('/api/auth/pins');
    expect(JSON.stringify(r.body)).not.toMatch(/scrypt\$/);
    expect(JSON.stringify((await superA.get('/api/profiles')).body)).not.toMatch(/scrypt\$|"pin(_hash)?"/i);
  });
});

describe('PIN management is super-owner only', () => {
  it('owner, manager, trainer and member cannot set PINs', async () => {
    for (const a of [ownerA, managerA, trainerA, memberA]) {
      expect((await a.put('/api/auth/pins/usr_trainer_2').send({ pin: '9999' })).status).toBe(403);
      expect((await a.get('/api/auth/pins')).status).toBe(403);
    }
  });
  it('nobody can change their own PIN except via super owner', async () => {
    expect((await trainerA.put('/api/auth/pins/usr_trainer_1').send({ pin: '9999' })).status).toBe(403);
    expect((await memberA.put(`/api/auth/pins/${memberSelf.id}`).send({ pin: '9999' })).status).toBe(403);
  });
  it('super owner can reset a PIN, which revokes old sessions', async () => {
    const t5 = await login((await superA.get('/api/profiles')).body.find((p: any) => p.id === 'usr_trainer_5').phone, '4444');
    expect((await superA.put('/api/auth/pins/usr_trainer_5').send({ pin: '8642' })).status).toBe(200);
    expect((await t5.agent.get('/api/auth/me')).body.profile).toBeNull();
    expect((await t5.agent.get('/api/members')).status).toBe(401);
    expect((await superA.put('/api/auth/pins/usr_trainer_5').send({ pin: '12' })).status).toBe(400);
  });
});

describe('trainer scope', () => {
  it('denied owner-only routes', async () => {
    const denied: [string, string, any?][] = [
      ['get', '/api/audit-logs'], ['get', '/api/export-logs'], ['get', '/api/payments'], ['get', '/api/sales-totals'],
      ['post', '/api/branches', { name: 'x' }], ['post', '/api/freellmapi/update-config', { provider: 'gemini', model: 'x' }],
      ['get', '/api/branches/br_nag_1/sms-config'], ['post', '/api/rpc/anything', {}], ['post', '/api/reset-seed'],
      ['delete', `/api/members/${memberSameBranch.id}`], ['post', '/api/members/bulk-update', {}], ['post', '/api/trainer-payroll/mark-paid', {}],
      ['post', '/api/winback/run', {}], ['post', '/api/announcements', { title: 'x', content: 'y' }], ['get', '/v1/models'],
    ];
    for (const [m, p, b] of denied) expect((await (trainerA as any)[m](p).send(b)).status, `${m} ${p}`).toBe(403);
  });
  it('sees only their branch members', async () => {
    const list = (await trainerA.get('/api/members')).body;
    const tb = trainer.assigned_branch_ids?.length ? trainer.assigned_branch_ids : [trainer.branch_id];
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((m: any) => tb.includes(m.branch_id))).toBe(true);
  });
  it('cannot touch a member in another branch', async () => {
    expect((await trainerA.get(`/api/members/${memberOtherBranch.id}/payments`)).status).toBe(403);
    expect((await trainerA.post(`/api/members/${memberOtherBranch.id}/payment`).send({ amount: 100 })).status).toBe(403);
  });
  it('can work with a member in their branch', async () => {
    expect((await trainerA.get(`/api/members/${memberSameBranch.id}/payments`)).status).toBe(200);
  });
  it('cannot read another trainer’s payroll', async () => {
    expect((await trainerA.get('/api/trainer-payroll?trainer_id=usr_trainer_3')).status).toBe(403);
  });
  it('cannot create a member in another branch', async () => {
    expect((await trainerA.post('/api/members').send({ full_name: 'X', phone: '9000000001', branch_id: memberOtherBranch.branch_id })).status).toBe(403);
  });
});

describe('member scope', () => {
  it('sees only themself', async () => {
    const list = (await memberA.get('/api/members')).body;
    expect(list.map((m: any) => m.id)).toEqual([memberSelf.id]);
  });
  it('can read own payments but not someone else’s', async () => {
    expect((await memberA.get(`/api/members/${memberSelf.id}/payments`)).status).toBe(200);
    expect((await memberA.get(`/api/members/${memberSameBranch.id}/payments`)).status).toBe(403);
  });
  it('denied staff routes', async () => {
    for (const p of ['/api/profiles', '/api/leads', '/api/payments', '/api/audit-logs', '/api/day-register', '/api/trainer-payroll', '/api/notifications']) {
      expect((await memberA.get(p)).status, p).toBe(403);
    }
    expect((await memberA.post(`/api/members/${memberSelf.id}/payment`).send({ amount: 1 })).status).toBe(403);
    expect((await memberA.post('/api/members').send({ full_name: 'x', phone: '9000000002' })).status).toBe(403);
  });
  it('cannot file a freeze request for another member', async () => {
    expect((await memberA.post('/api/freeze-requests').send({ member_id: memberSameBranch.id })).status).toBe(403);
  });
  it('can use the AI coach', async () => {
    expect((await memberA.post('/api/freellmapi/coach-chat').send({ messages: [{ role: 'user', content: 'tip' }] })).status).toBe(200);
  });
});

describe('branch manager & owner scope', () => {
  it('manager cannot change global config', async () => {
    expect((await managerA.post('/api/freellmapi/update-config').send({ provider: 'gemini', model: 'x' })).status).toBe(403);
    expect((await managerA.post('/api/branches').send({ name: 'x' })).status).toBe(403);
  });
  it('manager list views are branch scoped', async () => {
    const list = (await managerA.get('/api/members')).body;
    expect(list.every((m: any) => m.branch_id === 'br_rr_2')).toBe(true);
  });
  it('owner (not super) has full data access but cannot reset seed or hard delete', async () => {
    expect((await ownerA.get('/api/audit-logs')).status).toBe(200);
    expect((await ownerA.post('/api/reset-seed')).status).toBe(403);
    expect((await ownerA.delete(`/api/members/${memberSameBranch.id}`)).status).toBe(403);
  });
});

describe('bug-hunt regressions', () => {
  it('trainer onboarding with auto branch lands in the trainer’s branch, not a name-detected one', async () => {
    const r = await trainerA.post('/api/members').send({ full_name: 'Bsk Rohan', phone: '9000000077', branch_id: 'auto' });
    expect(r.status).toBeLessThan(300);
    const m = r.body.member || r.body;
    expect(m.branch_id).toBe(trainer.branch_id);
  });
  it('manager bulk-update cannot include members from other branches', async () => {
    const r = await managerA.post('/api/members/bulk-update').send({ member_ids: [memberSameBranch.id], updates: {} });
    expect(r.status).toBe(403);
  });
});
describe('activate scope', () => {
  it('manager cannot activate a member in another branch via body id', async () => {
    expect((await managerA.post('/api/members/activate').send({ p_member_id: memberSameBranch.id })).status).toBe(403);
  });
});
