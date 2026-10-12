import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { templateCopy, parseAiCopy, FESTIVALS, BANNER_TYPES } from '../src/lib/bannerTemplates';

let app: Express;
const login = async (phone: string, pin: string) => {
  const a = request.agent(app);
  expect((await a.post('/api/auth/login').send({ phone, pin })).status).toBe(200);
  return a;
};
let superA: any, ownerA: any, managerA: any, trainerA: any, memberA: any, memberOther: any;

beforeAll(async () => {
  ({ app } = (await import('../server')) as any);
  (await import('../src/server/auth')).loginThrottle.reset();
  superA = await login('9876543210', '1111');
  ownerA = await login('9876543210', '2222');
  managerA = await login('9822334455', '3333');
  trainerA = await login('9812345671', '4444');
  const members = (await superA.get('/api/members')).body;
  const uniq = (m: any) => members.filter((x: any) => x.phone === m.phone).length === 1;
  const nag = members.find((m: any) => m.branch_id === 'br_nag_1' && uniq(m));
  const other = members.find((m: any) => m.branch_id !== 'br_nag_1' && uniq(m));
  memberA = await login(nag.phone, '5555');
  memberOther = await login(other.phone, '5555');
});

describe('templates', () => {
  it('produce English + Kannada copy for every type', () => {
    for (const type of BANNER_TYPES) {
      const c = templateCopy({ type, title: 'Test', offer: '30% off' });
      expect(c.headline).toBeTruthy();
      expect(c.cta).toBeTruthy();
      expect(c.kn?.cta).toMatch(/[\u0C80-\u0CFF]/);
    }
  });
  it('festival wishes are festival specific, in both languages', () => {
    for (const k of Object.keys(FESTIVALS) as (keyof typeof FESTIVALS)[]) {
      const c = templateCopy({ type: 'festival', title: '', festival: k });
      expect(c.headline).toBe(FESTIVALS[k].wishEn);
      expect(c.kn!.headline).toBe(FESTIVALS[k].wishKn);
    }
  });
  it('parseAiCopy accepts fenced JSON and rejects junk / non-Kannada kn', () => {
    const ok = parseAiCopy('```json\n{"headline":"Run!","subline":"s","body":"b","cta":"Go","kn":{"headline":"ಓಡಿ","subline":"","body":"","cta":"ಬನ್ನಿ"}}\n```');
    expect(ok?.headline).toBe('Run!');
    expect(ok?.kn?.headline).toBe('ಓಡಿ');
    expect(parseAiCopy('no json here')).toBeNull();
    expect(parseAiCopy('{"headline":"x","cta":"y","kn":{"headline":"latin only"}}')?.kn).toBeUndefined();
    expect(parseAiCopy('{"headline":"' + 'x'.repeat(500) + '","cta":"y"}')!.headline.length).toBeLessThanOrEqual(60);
  });
});

describe('banner API', () => {
  it('owner gets copy (offline template fallback when AI unreachable)', async () => {
    const r = await ownerA.post('/api/banners/copy').send({ type: 'festival', festival: 'rajyotsava', language: 'both' });
    expect(r.status).toBe(200);
    expect(r.body.source).toBe('template');
    expect(r.body.copy.kn.headline).toContain('ರಾಜ್ಯೋತ್ಸವ');
  });
  it('validates input', async () => {
    expect((await superA.post('/api/banners/copy').send({ type: 'spam' })).status).toBe(400);
    expect((await superA.post('/api/banners/copy').send({ type: 'festival', festival: 'nope' })).status).toBe(400);
  });
  it('super owner and owner can save; history records creator', async () => {
    const r = await superA.post('/api/banners').send({ type: 'offer', title: 'Diwali Mega Offer', offer: 'Flat 30% off', price: '₹2,999', branch_ids: ['br_nag_1'], theme: 'festive' });
    expect(r.status).toBe(201);
    expect(r.body.created_by).toBe('usr_super_1');
    expect((await ownerA.post('/api/banners').send({ type: 'marathon', title: 'Pulse 10K', branch_ids: ['br_rr_2'] })).status).toBe(201);
    const list = (await ownerA.get('/api/banners')).body;
    expect(list.length).toBeGreaterThanOrEqual(2);
  });
  it('trainers, managers and members cannot create, generate or edit banners', async () => {
    const id = (await superA.get('/api/banners')).body[0].id;
    for (const a of [trainerA, managerA, memberA]) {
      expect((await a.post('/api/banners').send({ type: 'offer', title: 'x' })).status).toBe(403);
      expect((await a.post('/api/banners/copy').send({ type: 'offer', title: 'x' })).status).toBe(403);
      expect((await a.put(`/api/banners/${id}`).send({ status: 'archived' })).status).toBe(403);
    }
  });
  it('members see only active, visible offers for their branch', async () => {
    const mine = (await memberA.get('/api/banners')).body;
    expect(mine.some((b: any) => b.title === 'Diwali Mega Offer')).toBe(true);
    expect(mine.every((b: any) => b.branch_ids.includes('br_nag_1'))).toBe(true);
    const other = (await memberOther.get('/api/banners')).body;
    expect(other.some((b: any) => b.title === 'Diwali Mega Offer')).toBe(false);
  });
  it('archived and hidden banners disappear for members', async () => {
    const b = (await superA.get('/api/banners')).body.find((x: any) => x.title === 'Diwali Mega Offer');
    expect((await superA.put(`/api/banners/${b.id}`).send({ status: 'archived' })).status).toBe(200);
    expect((await memberA.get('/api/banners')).body.some((x: any) => x.id === b.id)).toBe(false);
    const h = (await superA.post('/api/banners').send({ type: 'event', title: 'Staff only', branch_ids: ['br_nag_1'], visible_to_members: false })).body;
    expect((await memberA.get('/api/banners')).body.some((x: any) => x.id === h.id)).toBe(false);
  });
  it('expired banners are hidden from members', async () => {
    const e = (await superA.post('/api/banners').send({ type: 'offer', title: 'Old', branch_ids: ['br_nag_1'], valid_until: '2020-01-01' })).body;
    expect((await memberA.get('/api/banners')).body.some((x: any) => x.id === e.id)).toBe(false);
  });
  it('unauthenticated users cannot list banners', async () => {
    expect((await request(app).get('/api/banners')).status).toBe(401);
  });
});
describe('template wording', () => {
  it('does not double "till" in offer validity', () => {
    expect(templateCopy({ type: 'offer', title: 'x', date: 'till 31 Oct' }).body).not.toMatch(/till till/);
    expect(templateCopy({ type: 'offer', title: 'x', date: '31 Oct' }).body).toMatch(/Valid till 31 Oct/);
  });
});
