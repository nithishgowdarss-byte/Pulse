import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

let app: Express;
let A: ReturnType<typeof request.agent>;
beforeAll(async () => {
  ({ app } = (await import('../server')) as any);
  A = request.agent(app);
  const r = await A.post('/api/auth/login').send({ phone: '9876543210', pin: '1111' });
  expect(r.status).toBe(200);
});

describe('health & hardening', () => {
  it('serves /healthz', async () => {
    const r = await A.get('/healthz');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
  });
  it('sets security headers and hides x-powered-by', async () => {
    const r = await A.get('/api/branches');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });
  it('removed the source-code dump endpoints', async () => {
    for (const p of ['/api/codebase/manifest', '/api/codebase/file?path=.env', '/api/download-codebase-pdf', '/api/download-codebase-txt', '/api/view-codebase-pdf']) {
      const r = await A.get(p);
      expect(r.status, p).toBe(404);
      expect(JSON.stringify(r.body)).not.toContain('GEMINI');
    }
  });
  it('returns JSON 404 for unknown api routes', async () => {
    const r = await A.get('/api/nope');
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('Not found');
  });
  it('rejects malformed JSON with 400', async () => {
    const r = await A.post('/api/members').set('Content-Type', 'application/json').send('{bad');
    expect(r.status).toBe(400);
  });
  it('rejects oversized bodies with 413', async () => {
    const r = await A.post('/api/members').send({ notes: 'x'.repeat(1_200_000) });
    expect(r.status).toBe(413);
  });
});

describe('core data', () => {
  it('seeds the 3 branches', async () => {
    const r = await A.get('/api/branches');
    expect(r.status).toBe(200);
    const names = r.body.map((b: any) => b.name).join(' ');
    for (const n of ['Nagarabhavi', 'RR Nagar', 'Banashankari']) expect(names).toContain(n);
  });
  it('lists profiles with owner and trainer roles', async () => {
    const r = await A.get('/api/profiles');
    const roles = new Set(r.body.map((p: any) => p.role));
    expect(roles.has('trainer')).toBe(true);
    expect(roles.has('owner') || roles.has('super_owner')).toBe(true);
  });
  it('creates a member and requires name+phone', async () => {
    const bad = await A.post('/api/members').send({ full_name: 'X' });
    expect(bad.status).toBe(400);
    const ok = await A.post('/api/members').send({ full_name: 'Test Member', phone: '9999988888', branch_id: 'br_nag_1' });
    expect([200, 201]).toContain(ok.status);
  });
  it('numeric phone no longer crashes member creation', async () => {
    const r = await A.post('/api/members').send({ full_name: 'Num Phone', phone: 9999911111, branch_id: 'br_rr_2' });
    expect(r.status).toBeLessThan(500);
  });
});

describe('payment validation', () => {
  const memberId = async () => (await A.get('/api/members')).body[0].id;
  it('rejects non-numeric amount (previously stored NaN)', async () => {
    const id = await memberId();
    const before = (await A.get('/api/members')).body.find((m: any) => m.id === id).amount_paid;
    const r = await A.post(`/api/members/${id}/payment`).send({ amount: 'abc', payment_method: 'cash' });
    expect(r.status).toBe(400);
    const after = (await A.get('/api/members')).body.find((m: any) => m.id === id).amount_paid;
    expect(after).toBe(before);
  });
  it('rejects absurd and negative amounts', async () => {
    const id = await memberId();
    expect((await A.post(`/api/members/${id}/payment`).send({ amount: 1e12 })).status).toBe(400);
    expect((await A.post(`/api/members/${id}/payment`).send({ amount: -50 })).status).toBe(400);
  });
  it('accepts a valid payment', async () => {
    const id = await memberId();
    const r = await A.post(`/api/members/${id}/payment`).send({ amount: 500, payment_method: 'cash' });
    expect(r.status).toBeLessThan(300);
  });
});

describe('AI config hardening', () => {
  it('refuses runtime API keys via HTTP', async () => {
    const r = await A.post('/api/freellmapi/update-config').send({ provider: 'groq', apiKey: 'attacker-key' });
    expect(r.status).toBe(403);
  });
  it('does not wipe keys when updating only the model', async () => {
    const r = await A.post('/api/freellmapi/update-config').send({ provider: 'gemini', model: 'gemini-2.5-flash' });
    expect(r.status).toBe(200);
    const g = r.body.status.providers.find((p: any) => p.id === 'gemini');
    expect(g.defaultModel).toBe('gemini-2.5-flash');
  });
  it('status never exposes key material', async () => {
    const r = await A.get('/api/freellmapi/status');
    expect(JSON.stringify(r.body)).not.toMatch(/apiKey"\s*:\s*"[^"]+/);
  });
  it('coach chat falls back to the offline engine when no provider is reachable', async () => {
    const r = await A.post('/api/freellmapi/coach-chat').send({ messages: [{ role: 'user', content: 'workout plan please' }] });
    expect(r.status).toBe(200);
    expect(r.body.model).toBe('pulse-local-smart-engine');
    expect(r.body.content.length).toBeGreaterThan(50);
  });
});
