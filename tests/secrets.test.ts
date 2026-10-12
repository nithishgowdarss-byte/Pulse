import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { seal, unseal, createVault } from '../src/server/secrets';

describe('seal/unseal', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const a = seal('msg91-secret-key', 'id1'), b = seal('msg91-secret-key', 'id1');
    expect(a.ct).not.toBe(b.ct);
    expect(unseal(a, 'id1')).toBe('msg91-secret-key');
    expect(JSON.stringify(a)).not.toContain('msg91-secret-key');
  });
  it('rejects tampering and id swaps (AAD)', () => {
    const a = seal('topsecret', 'id1');
    expect(() => unseal(a, 'id2')).toThrow();
    const t = { ...a, ct: Buffer.from('x' + Buffer.from(a.ct, 'base64').toString('binary'), 'binary').toString('base64') };
    expect(() => unseal(t, 'id1')).toThrow();
  });
  it('vault get returns null for missing/corrupt', () => {
    const store: any = {};
    const v = createVault(() => store);
    v.put('k', 'val');
    expect(v.get('k')).toBe('val');
    store.k.tag = Buffer.alloc(16).toString('base64');
    expect(v.get('k')).toBeNull();
    expect(v.get('nope')).toBeNull();
  });
});

describe('MSG91 key handling', () => {
  let app: Express; let superA: any;
  const KEY = 'MSG91-LIVE-KEY-abcdef123456';
  beforeAll(async () => {
    ({ app } = (await import('../server')) as any);
    (await import('../src/server/auth')).loginThrottle.reset();
    superA = request.agent(app);
    await superA.post('/api/auth/login').send({ phone: '9876543210', pin: '1111' });
  });
  it('never returns the key from any endpoint after saving', async () => {
    const r = await superA.post('/api/branches/br_nag_1/sms-config').send({ msg91_auth_key: KEY, msg91_sender_id: 'PULSEF' });
    expect(r.status).toBeLessThan(300);
    expect(JSON.stringify(r.body)).not.toContain(KEY);
    for (const p of ['/api/branches/br_nag_1/sms-config', '/api/audit-logs', '/api/branches', '/api/branches/br_nag_1/rotation-logs']) {
      const g = await superA.get(p);
      expect(JSON.stringify(g.body), p).not.toContain(KEY);
    }
    expect((await superA.get('/api/branches/br_nag_1/sms-config')).body.msg91_last4).toBe('3456');
  });
});
