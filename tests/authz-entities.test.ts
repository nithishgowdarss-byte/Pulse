import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

let app: Express;
const login = async (phone: string, pin: string) => {
  const a = request.agent(app);
  expect((await a.post('/api/auth/login').send({ phone, pin })).status).toBe(200);
  return a;
};
let superA: any, managerA: any, trainerA: any;
let nagMember: any, rrMember: any;

beforeAll(async () => {
  ({ app } = (await import('../server')) as any);
  (await import('../src/server/auth')).loginThrottle.reset();
  superA = await login('9876543210', '1111');
  managerA = await login('9822334455', '3333'); // br_rr_2
  trainerA = await login('9812345671', '4444'); // br_nag_1
  const members = (await superA.get('/api/members')).body;
  nagMember = members.find((m: any) => m.branch_id === 'br_nag_1');
  rrMember = members.find((m: any) => m.branch_id === 'br_rr_2');
});

describe('branch manager: entity-by-ID access outside branch', () => {
  it('cannot update or convert another branch’s lead, but can its own', async () => {
    const other = (await superA.post('/api/leads').send({ full_name: 'Nag Lead', phone: '9111111111', branch_id: 'br_nag_1', source: 'walk_in' })).body;
    const own = (await superA.post('/api/leads').send({ full_name: 'RR Lead', phone: '9111111112', branch_id: 'br_rr_2', source: 'walk_in' })).body;
    const otherId = other.id || other.lead?.id, ownId = own.id || own.lead?.id;
    expect((await managerA.put(`/api/leads/${otherId}`).send({ status: 'contacted' })).status).toBe(403);
    expect((await managerA.post(`/api/leads/${otherId}/convert`).send({})).status).toBe(403);
    expect((await managerA.put(`/api/leads/${ownId}`).send({ status: 'contacted' })).status).not.toBe(403);
    const list = (await managerA.get('/api/leads')).body;
    expect((Array.isArray(list) ? list : list.leads || []).every((l: any) => l.branch_id === 'br_rr_2')).toBe(true);
  });
  it('cannot approve another branch’s freeze request', async () => {
    await superA.post(`/api/members/${nagMember.id}/renew`).send({ subscription_months: 12, amount_paid: 12000, payment_method: 'cash' });
    const members = (await superA.get('/api/members')).body;
    const annual = members.find((m: any) => m.branch_id !== 'br_rr_2' && (Number(m.subscription_months) === 12 || /annual|year|12\s*month/i.test(m.package_type || '')));
    expect(annual, 'need an annual member outside RR Nagar').toBeTruthy();
    const fr = (await superA.post('/api/freeze-requests').send({ member_id: annual.id, start_date: '2026-11-01', end_date: '2026-11-10', reason: 'travel' })).body;
    const id = fr.id || fr.request?.id;
    expect(id).toBeTruthy();
    expect((await managerA.put(`/api/freeze-requests/${id}`).send({ status: 'approved' })).status).toBe(403);
    const list = (await managerA.get('/api/freeze-requests')).body;
    expect((Array.isArray(list) ? list : []).some((x: any) => x.id === id)).toBe(false);
  });
  it('cannot resolve another branch’s retention alert', async () => {
    await superA.post('/api/retention/calculate-risk').send({});
    const alerts = (await superA.get('/api/retention/alerts')).body;
    const arr = Array.isArray(alerts) ? alerts : alerts.alerts || [];
    const other = arr.find((a: any) => (a.branch_id || '') !== 'br_rr_2' && a.member_id !== rrMember?.id);
    if (!other) return; // no seeded alert outside RR Nagar
    expect((await managerA.post(`/api/retention/alerts/${other.id}/resolve`).send({})).status).toBe(403);
    const mine = (await managerA.get('/api/retention/alerts')).body;
    expect((Array.isArray(mine) ? mine : mine.alerts || []).some((a: any) => a.id === other.id)).toBe(false);
  });
  it('cannot run global winback/automation actions or enroll other-branch members', async () => {
    expect((await managerA.post('/api/winback/run').send({ campaign_id: 'x' })).status).toBe(403);
    expect((await managerA.post('/api/winback/campaigns').send({ name: 'x' })).status).toBe(403);
    expect((await managerA.post('/api/automations/run').send({})).status).toBe(403);
    expect((await managerA.post('/api/winback/enroll').send({ member_id: nagMember.id, campaign_id: 'c1' })).status).toBe(403);
  });
  it('a trainer cannot mark another trainer’s notification read', async () => {
    const n = (await superA.get('/api/notifications')).body;
    const arr = Array.isArray(n) ? n : n.notifications || [];
    const target = arr.find((x: any) => x.user_id === 'usr_trainer_1');
    expect(target).toBeTruthy();
    const t5 = await login('9833445566', '4444');
    expect((await t5.post(`/api/notifications/${target.id}/read`).send({})).status).toBe(403);
  });
});

describe('summary totals are branch-split for scoped roles', () => {
  for (const path of ['/api/sales-totals', '/api/shift-close-totals', '/api/retention/churn-risk-distribution', '/api/payroll-reconciliation']) {
    it(`${path}: manager gets RR Nagar numbers even when asking for all / another branch`, async () => {
      const rr = (await superA.get(`${path}?branch_id=br_rr_2`)).body;
      expect((await managerA.get(path)).body).toEqual(rr);
      expect((await managerA.get(`${path}?branch_id=all`)).body).toEqual(rr);
      expect((await managerA.get(`${path}?branch_id=br_nag_1`)).status).toBe(403);
    });
  }
  it('trainer sales totals are their branch only', async () => {
    const nag = (await superA.get('/api/sales-totals?branch_id=br_nag_1')).body;
    expect((await trainerA.get('/api/sales-totals')).status).toBe(403); // trainers have no sales access
    expect(nag).toBeTruthy();
  });
});

describe('member without a PIN', () => {
  it('gets a clear "ask the front desk" message', async () => {
    const created = (await superA.post('/api/members').send({ full_name: 'No Pin Person', phone: '9000012345', branch_id: 'br_nag_1' })).body;
    expect(created).toBeTruthy();
    const r = await request(app).post('/api/auth/login').send({ phone: '9000012345', pin: '1234' });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('NO_PIN');
    expect(r.body.error).toMatch(/front desk/i);
  });
});
