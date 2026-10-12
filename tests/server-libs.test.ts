import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { createPersistence } from '../src/server/persistence';
import { createRateLimiter } from '../src/server/http';
import { validateBody } from '../src/server/validation';

describe('persistence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-'));
  afterEach(() => fs.rmSync(path.join(dir, 'pulse-db.json'), { force: true }));
  it('round-trips a snapshot atomically', () => {
    let state = { members: [{ id: 'm1' }] };
    const p = createPersistence({ dataDir: dir, snapshot: () => state, restore: (d) => { state = d as any; } });
    p.markDirty();
    expect(p.flush()).toBe(true);
    state = { members: [] };
    expect(p.load()).toBe(true);
    expect(state.members).toEqual([{ id: 'm1' }]);
    expect(fs.statSync(p.file).mode & 0o777).toBe(0o600);
  });
  it('quarantines a corrupt snapshot instead of crashing', () => {
    fs.writeFileSync(path.join(dir, 'pulse-db.json'), '{not json');
    const p = createPersistence({ dataDir: dir, snapshot: () => ({}), restore: () => {} });
    expect(p.load()).toBe(false);
    expect(fs.readdirSync(dir).some((f) => f.includes('corrupt'))).toBe(true);
  });
  it('is a no-op when disabled', () => {
    const p = createPersistence({ dataDir: dir, enabled: false, snapshot: () => ({ a: 1 }), restore: () => {} });
    p.markDirty();
    expect(p.flush()).toBe(false);
  });
});

describe('rate limiter', () => {
  it('returns 429 after the limit', async () => {
    const app = express();
    app.use(createRateLimiter({ windowMs: 60_000, max: 3 }));
    app.get('/', (_q, r) => r.send('ok'));
    for (let i = 0; i < 3; i++) expect((await request(app).get('/')).status).toBe(200);
    const r = await request(app).get('/');
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBeDefined();
  });
});

describe('validateBody', () => {
  it.each([
    [{ amount: 'abc' }, /amount/],
    [{ amount: -1 }, /amount/],
    [{ amount: 1e12 }, /amount/],
    [{ commission_rate: 150 }, /commission_rate/],
    [{ phone: { $ne: 1 } }, /phone/],
    [{ notes: 'x'.repeat(10_001) }, /notes/],
  ])('rejects %j', (body, re) => {
    expect(validateBody(body)).toMatch(re);
  });
  it.each([[{ amount: 500 }], [{ amount: '1200.50' }], [{ phone: '9876543210' }], [{}], [{ amount: '' }]])('accepts %j', (body) => {
    expect(validateBody(body)).toBeNull();
  });
  it('normalizes numeric phone to string', () => {
    const b: any = { phone: 9876543210 };
    expect(validateBody(b)).toBeNull();
    expect(b.phone).toBe('9876543210');
  });
});

import { createBasicAuthGate } from '../src/server/http';
describe('basic auth gate', () => {
  const app = express();
  app.use(createBasicAuthGate('owner:s3cret'));
  app.get('/healthz', (_q, r) => r.send('ok'));
  app.get('/api/x', (_q, r) => r.send('ok'));
  it('allows health without creds', async () => expect((await request(app).get('/healthz')).status).toBe(200));
  it('blocks without creds', async () => expect((await request(app).get('/api/x')).status).toBe(401));
  it('blocks wrong creds', async () => expect((await request(app).get('/api/x').auth('owner', 'nope')).status).toBe(401));
  it('allows right creds', async () => expect((await request(app).get('/api/x').auth('owner', 's3cret')).status).toBe(200));
});

describe('AI message validation', () => {
  it('caps message count and size', () => {
    expect(validateBody({ messages: Array(41).fill({ role: 'user', content: 'x' }) })).toMatch(/messages/);
    expect(validateBody({ messages: [{ role: 'user', content: 'x'.repeat(8001) }] })).toMatch(/message/);
    expect(validateBody({ messages: [{ role: 'tool', content: 'x' }] })).toMatch(/role/);
    expect(validateBody({ messages: [{ role: 'user', content: 'hi' }] })).toBeNull();
  });
});

import { csvCell } from '../src/lib/csv';
describe('csvCell', () => {
  it('neutralises formulas and quotes', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+91 98')).toBe(`"'+91 98"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(csvCell(-250)).toBe('-250');
    expect(csvCell('Rhea Sen')).toBe('Rhea Sen');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell(null)).toBe('');
  });
});
