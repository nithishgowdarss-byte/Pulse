import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import request from 'supertest';

let mod: any, app: any, superA: any, managerA: any, trainerA: any, ownerA: any, members: any[];
const login = async (phone: string, pin: string) => { const a = request.agent(app); expect((await a.post('/api/auth/login').send({ phone, pin })).status).toBe(200); return a; };
beforeAll(async () => {
  mod = await import('../server'); app = mod.app;
  (await import('../src/server/auth')).loginThrottle.reset();
  superA = await login('9876543210', '1111'); ownerA = await login('9876543210', '2222');
  managerA = await login('9822334455', '3333'); trainerA = await login('9812345671', '4444');
  members = (await superA.get('/api/members')).body;
});
afterEach(() => vi.useRealTimers());

describe('My Shift: staff self check-in via RPC', () => {
  it('trainer and manager can check themselves in/out; body staff_id cannot impersonate', async () => {
    for (const [a, id] of [[trainerA, 'usr_trainer_1'], [managerA, 'usr_manager_1']] as const) {
      await a.post('/api/rpc/staff_check_out').send({});
      const r = await a.post('/api/rpc/staff_check_in').send({ p_staff_id: 'usr_owner_1', p_method: 'manual' });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.staff_id).toBe(id);
      expect((await a.post('/api/rpc/staff_check_in').send({})).status).toBe(400);
      expect((await a.post('/api/rpc/staff_check_out').send({ p_staff_id: 'usr_owner_1' })).status).toBe(200);
    }
  });
  it('manager cannot check in at another branch; other RPCs stay owner-only', async () => {
    expect((await managerA.post('/api/rpc/staff_check_in').send({ p_branch_id: 'br_nag_1' })).status).toBe(403);
    expect((await trainerA.post('/api/rpc/record_payment').send({})).status).toBe(403);
    expect((await managerA.post('/api/rpc/record_payment').send({})).status).toBe(403);
  });
});

describe('quiet hours use IST, not server time', () => {
  it('21:00–08:00 IST is silent regardless of server TZ', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T16:00:00Z')); // 21:30 IST
    expect(mod.inSilenceHoursIST()).toBe(true);
    vi.setSystemTime(new Date('2026-10-12T02:00:00Z')); // 07:30 IST
    expect(mod.inSilenceHoursIST()).toBe(true);
    vi.setSystemTime(new Date('2026-10-12T05:00:00Z')); // 10:30 IST
    expect(mod.inSilenceHoursIST()).toBe(false);
    vi.setSystemTime(new Date('2026-10-12T15:29:00Z')); // 20:59 IST
    expect(mod.inSilenceHoursIST()).toBe(false);
  });
});

describe('addMonthsToDate month-end clamp', () => {
  it.each([['2026-01-31', 1, '2026-02-28'], ['2028-01-31', 1, '2028-02-29'], ['2026-03-31', 1, '2026-04-30'], ['2026-08-31', 6, '2027-02-28'], ['2026-12-15', 1, '2027-01-15'], ['2026-10-12', 12, '2027-10-12'], ['2026-05-31', 36, '2029-05-31']])('%s + %i → %s', (d, m, exp) => {
    expect(mod.addMonthsToDate(d, m)).toBe(exp);
  });
});

describe('direct freeze enforces annual-only and 30 days', () => {
  it('rejects non-annual and >30 day freezes', async () => {
    const annual = members.find((m) => Number(m.subscription_months) === 12 || /annual/i.test(m.package_type));
    const monthly = members.find((m) => Number(m.subscription_months) === 1 && !/annual/i.test(m.package_type));
    let r = await superA.post(`/api/members/${monthly.id}/freeze`).send({ start_date: '2026-11-01', end_date: '2026-11-10', reason: 'trip' });
    expect(r.body.code).toBe('FREEZE_ANNUAL_ONLY');
    r = await superA.post(`/api/members/${annual.id}/freeze`).send({ start_date: '2026-11-01', end_date: '2026-12-15', reason: 'surgery' });
    expect(r.body.code).toBe('FREEZE_MAX_30_DAYS');
    r = await superA.post(`/api/members/${annual.id}/freeze`).send({ start_date: 'garbage', end_date: '2026-12-15' });
    expect(r.status).toBe(400);
    r = await superA.post(`/api/members/${annual.id}/freeze`).send({ start_date: '2026-11-01', end_date: '2026-11-20', reason: 'trip', frozen_by: 'Fake Person' });
    expect(r.status).toBe(200);
  });
});

describe('transfer/archive actor comes from the session', () => {
  it('ignores transferred_by / archived_by in the body', async () => {
    const m = members.find((x) => x.branch_id === 'br_nag_1' && !x.is_archived);
    const t = await ownerA.post(`/api/members/${m.id}/transfer`).send({ new_branch_id: 'br_bsk_3', transferred_by: 'usr_trainer_1', reason: 'moved' });
    expect(t.status).toBe(200);
    const logs = (await superA.get('/api/audit-logs')).body;
    const entry = (logs.logs || logs).find((l: any) => l.action === 'MEMBER_TRANSFERRED' && l.entity_id === m.id);
    expect(entry.user_id).toBe('usr_owner_1'); expect(entry.user_name).not.toBe('Management');
    const a = await superA.post(`/api/members/${m.id}/archive`).send({ archived_by: 'usr_trainer_1' });
    expect(a.body.archived_by).toBe('usr_super_1');
    await superA.post(`/api/members/${m.id}/restore`).send({});
  });
});

describe('leads: unknown values are rejected, not silently defaulted', () => {
  it('validates source, status, branch, trainer and phone', async () => {
    const base = { full_name: 'ಲೀಡ್ ಟೆಸ್ಟ್ 🙂', phone: '9123456780', branch_id: 'br_rr_2' };
    for (const bad of [{ source: 'TikTok' }, { status: 'Lukewarm' }, { branch_id: 'br_mars_9' }, { assigned_trainer_id: 'usr_nobody' }, { phone: '12345' }]) {
      const r = await superA.post('/api/leads').send({ ...base, ...bad });
      expect(r.status, JSON.stringify(bad)).toBe(400); expect(r.body.error).toBeTruthy();
    }
    const ok = await superA.post('/api/leads').send({ ...base, source: 'walk_in' });
    expect(ok.status).toBe(201); expect((ok.body.lead || ok.body).source).toBe('Walk-in');
    const id = (ok.body.lead || ok.body).id;
    expect((await superA.put(`/api/leads/${id}`).send({ status: 'Lukewarm' })).status).toBe(400);
  });
});

describe('subscription months must be whole numbers', () => {
  it('rejects 1.5 and "3abc" on renew', async () => {
    const m = members.find((x) => !x.is_archived);
    for (const v of [1.5, '3abc', 0, 37, -1]) expect((await superA.post(`/api/members/${m.id}/renew`).send({ subscription_months: v, payment_method: 'Cash', amount_paid: 1000 })).status, String(v)).toBe(400);
  });
});

describe('round3 condition-run gaps', () => {
  it('re-converting a converted lead returns 409', async () => {
    const c = await ownerA.post('/api/leads').send({ full_name: 'Farhan Qureshi', phone: '9890011223', source: 'Walk-in' });
    expect(c.status).toBeLessThan(300);
    const id = (c.body.lead || c.body).id;
    expect((await ownerA.post(`/api/leads/${id}/convert`).send({})).status).toBe(200);
    const again = await ownerA.post(`/api/leads/${id}/convert`).send({});
    expect(again.status).toBe(409); expect(again.body.code).toBe('ALREADY_CONVERTED');
  });
  it('PT expiry rejects impossible calendar dates', async () => {
    const r = await ownerA.post('/api/pt-packages').send({ member_id: 'mem_4', trainer_id: 'usr_trainer_1', sessions_total: 5, price: 1000, expires_on: '2026-02-30' });
    expect(r.status).toBe(400); expect(r.body.error).toBe('Expiry must be a valid date (YYYY-MM-DD)');
  });
  it('flag-stale never says "undefined days"', async () => {
    const r = await ownerA.post('/api/retention/flag-stale').send({ member_id: 'mem_3' });
    expect(r.status).toBeLessThan(300); expect(r.body.alert.message).not.toMatch(/undefined|NaN/);
  });
  it('unknown winback campaign is rejected for enroll and run', async () => {
    const e = await ownerA.post('/api/winback/enroll').send({ member_id: 'mem_4', campaign_id: 'camp_nope' });
    expect(e.status).toBe(404);
    const r = await ownerA.post('/api/winback/run').send({ campaign_id: 'camp_nope' });
    expect(r.status).toBe(400);
  });
  it('runtime API keys refused even without provider', async () => {
    const r = await superA.post('/api/freellmapi/update-config').send({ apiKey: 'sk-test-not-real' });
    expect(r.status).toBe(403); expect(r.body.code).toBe('RUNTIME_KEYS_DISABLED');
  });
});
describe('outreach channel', () => {
  it('defaults to whatsapp when channel omitted (was 500) and rejects unknown', async () => {
    const r = await ownerA.post('/api/retention/send-outreach').send({ member_id: 'mem_4', message_body: 'Hi Ananya, we miss you at Pulse!' });
    expect(r.status).toBe(200); expect(['sent', 'skipped']).toContain(r.body.log.status);
    expect((await ownerA.post('/api/retention/send-outreach').send({ member_id: 'mem_4', message_body: 'x', channel: 'fax' })).status).toBe(400);
  });
});
