import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createSqliteStore, migrate, MIGRATIONS } from '../src/server/sqliteStore';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-sqlite-'));

describe('sqlite store', () => {
  it('persists collections (arrays + objects) across reopen', () => {
    const dir = tmp();
    let state: any = { members: [{ id: 'm1', n: 1 }, { id: 'm2', n: 2 }], pinHashes: { u1: 'h1' } };
    const s1 = createSqliteStore({ dataDir: dir, snapshot: () => state, restore: (d) => { state = d; } });
    s1.load(); // fresh db: persists seed
    state.members.push({ id: 'm3', n: 3 });
    s1.markDirty();
    expect(s1.flush()).toBe(true);
    s1.close();
    state = {};
    const s2 = createSqliteStore({ dataDir: dir, snapshot: () => state, restore: (d) => { state = d; } });
    expect(s2.load()).toBe(true);
    expect(state.members.map((m: any) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(state.pinHashes).toEqual({ u1: 'h1' });
    expect(fs.statSync(s2.file).mode & 0o777).toBe(0o600);
    s2.close();
  });
  it('imports the legacy JSON snapshot once and renames it', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'pulse-db.json'), JSON.stringify({ version: 1, data: { members: [{ id: 'legacy' }], banners: [] } }));
    let state: any = { members: [{ id: 'seed' }] };
    const s = createSqliteStore({ dataDir: dir, snapshot: () => state, restore: (d) => { state = d; } });
    expect(s.load()).toBe(true);
    expect(state.members).toEqual([{ id: 'legacy' }]);
    expect(fs.existsSync(path.join(dir, 'pulse-db.json'))).toBe(false);
    expect(fs.readdirSync(dir).some((f) => f.startsWith('pulse-db.json.imported-'))).toBe(true);
    s.close();
  });
  it('migrations are idempotent and recorded', () => {
    const dir = tmp();
    const s = createSqliteStore({ dataDir: dir, snapshot: () => ({}), restore: () => {} });
    s.load();
    s.close();
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.join(dir, 'pulse.db'));
    expect(migrate(db)).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) c FROM schema_migrations').get().c).toBe(MIGRATIONS.length);
    db.close();
  });
  it('only rewrites changed collections and handles duplicate/missing ids', () => {
    const dir = tmp();
    let state: any = { a: [{ id: 'x' }, { id: 'x' }, { noid: true }], b: [{ id: 'y' }] };
    const s = createSqliteStore({ dataDir: dir, snapshot: () => state, restore: (d) => { state = d; } });
    s.load();
    state.a.push({ id: 'z' });
    s.markDirty(); s.flush(); s.close();
    state = {};
    const s2 = createSqliteStore({ dataDir: dir, snapshot: () => state, restore: (d) => { state = d; } });
    s2.load();
    expect(state.a.length).toBe(4);
    expect(state.b).toEqual([{ id: 'y' }]);
    expect(s2.ping()).toBe(true);
    s2.close();
  });
});
