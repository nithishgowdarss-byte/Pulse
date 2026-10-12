import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const require_: NodeRequire = typeof require === 'function' ? require : createRequire(import.meta.url);

export interface StoreOptions {
  dataDir: string;
  enabled?: boolean;
  snapshot: () => Record<string, unknown>;
  restore: (data: Record<string, any>) => void;
  intervalMs?: number;
  file?: string; // override db file name (tests)
}

/** Ordered schema migrations. Append only; never edit a shipped migration. */
export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'documents',
    sql: `CREATE TABLE IF NOT EXISTS documents (
            collection TEXT NOT NULL,
            doc_id     TEXT NOT NULL,
            data       TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (collection, doc_id)
          );
          CREATE TABLE IF NOT EXISTS collection_meta (
            collection TEXT PRIMARY KEY,
            kind       TEXT NOT NULL,          -- 'array' | 'object'
            hash       TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );`,
  },
  {
    id: 2,
    name: 'import_log',
    sql: `CREATE TABLE IF NOT EXISTS import_log (source TEXT NOT NULL, imported_at TEXT NOT NULL, collections INTEGER NOT NULL);`,
  },
];

function openDb(file: string) {
  // Silence node:sqlite's one-time ExperimentalWarning
  const emit = process.emitWarning;
  (process as any).emitWarning = (w: any, ...a: any[]) => (String(w).includes('SQLite') ? undefined : emit.call(process, w, ...a));
  try {
    const { DatabaseSync } = require_('node:sqlite');
    return new DatabaseSync(file);
  } finally {
    (process as any).emitWarning = emit;
  }
}

export function migrate(db: any): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  const done = new Set<number>(db.prepare('SELECT id FROM schema_migrations').all().map((r: any) => r.id));
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(m.id, m.name, new Date().toISOString());
      db.exec('COMMIT');
      applied.push(m.id);
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return applied;
}

const docId = (item: any, i: number) => (item && typeof item === 'object' && (typeof item.id === 'string' || typeof item.id === 'number') ? String(item.id) : `#${i}`);

/**
 * SQLite-backed store (node:sqlite, WAL). Collections are kept in memory as the working set and
 * written to SQLite as one row per record; only collections whose content changed are rewritten.
 * On first boot it imports the legacy JSON snapshot (pulse-db.json) if present.
 */
export function createSqliteStore(opts: StoreOptions) {
  const enabled = opts.enabled !== false;
  const file = path.join(opts.dataDir, opts.file || 'pulse.db');
  let db: any = null;
  let dirty = false;
  let timer: NodeJS.Timeout | null = null;
  let lastSavedAt: string | null = null;
  const hashes = new Map<string, string>();

  function ensureDb() {
    if (db) return db;
    fs.mkdirSync(opts.dataDir, { recursive: true });
    db = openDb(file);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    migrate(db);
    try { fs.chmodSync(file, 0o600); } catch {}
    return db;
  }

  function readAll(): Record<string, any> | null {
    const metas = db.prepare('SELECT collection, kind, hash FROM collection_meta').all();
    if (!metas.length) return null;
    const out: Record<string, any> = {};
    const rowsStmt = db.prepare('SELECT doc_id, data FROM documents WHERE collection = ? ORDER BY rowid');
    for (const m of metas) {
      const rows = rowsStmt.all(m.collection);
      if (m.kind === 'array') out[m.collection] = rows.map((r: any) => JSON.parse(r.data));
      else out[m.collection] = Object.fromEntries(rows.map((r: any) => [r.doc_id, JSON.parse(r.data)]));
      hashes.set(m.collection, m.hash);
    }
    return out;
  }

  function writeAll(data: Record<string, unknown>, force = false) {
    const now = new Date().toISOString();
    const del = db.prepare('DELETE FROM documents WHERE collection = ?');
    const ins = db.prepare('INSERT INTO documents (collection, doc_id, data, updated_at) VALUES (?, ?, ?, ?)');
    const meta = db.prepare('INSERT INTO collection_meta (collection, kind, hash, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(collection) DO UPDATE SET kind=excluded.kind, hash=excluded.hash, updated_at=excluded.updated_at');
    let changed = 0;
    db.exec('BEGIN');
    try {
      for (const [name, value] of Object.entries(data)) {
        if (value === undefined) continue;
        const json = JSON.stringify(value);
        const h = crypto.createHash('sha1').update(json).digest('hex');
        if (!force && hashes.get(name) === h) continue;
        del.run(name);
        if (Array.isArray(value)) {
          const seen = new Set<string>();
          value.forEach((item, i) => {
            let id = docId(item, i);
            if (seen.has(id)) id = `${id}#${i}`;
            seen.add(id);
            ins.run(name, id, JSON.stringify(item), now);
          });
          meta.run(name, 'array', h, now);
        } else if (value && typeof value === 'object') {
          for (const [k, v] of Object.entries(value as Record<string, unknown>)) ins.run(name, k, JSON.stringify(v), now);
          meta.run(name, 'object', h, now);
        }
        hashes.set(name, h);
        changed++;
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return changed;
  }

  function flush() {
    if (!enabled || !dirty) return false;
    ensureDb();
    writeAll(opts.snapshot());
    dirty = false;
    lastSavedAt = new Date().toISOString();
    return true;
  }

  return {
    file,
    load(): boolean {
      if (!enabled) return false;
      ensureDb();
      const existing = readAll();
      if (existing) {
        opts.restore(existing);
        console.log(`[storage] restored ${Object.keys(existing).length} collections from ${file}`);
        return true;
      }
      // First boot: import legacy JSON snapshot if present
      const legacy = path.join(opts.dataDir, 'pulse-db.json');
      if (fs.existsSync(legacy)) {
        const parsed = JSON.parse(fs.readFileSync(legacy, 'utf8'));
        const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : null;
        if (data) {
          const n = writeAll(data, true);
          db.prepare('INSERT INTO import_log (source, imported_at, collections) VALUES (?, ?, ?)').run('pulse-db.json', new Date().toISOString(), n);
          fs.renameSync(legacy, `${legacy}.imported-${Date.now()}`);
          opts.restore(data);
          console.log(`[storage] imported ${n} collections from legacy ${legacy}`);
          return true;
        }
      }
      // Fresh database: persist the seed so later restarts are stable
      writeAll(opts.snapshot(), true);
      return false;
    },
    markDirty() {
      if (!enabled) return;
      dirty = true;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          try { flush(); } catch (err: any) { console.error('[storage] flush failed', err?.message); }
        }, opts.intervalMs ?? 500);
        timer.unref?.();
      }
    },
    flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      try { return flush(); } catch (err: any) { console.error('[storage] flush failed', err?.message); return false; }
    },
    close() { if (db) { try { db.close(); } catch {} db = null; } },
    ping(): boolean { if (!enabled) return true; try { ensureDb().prepare('SELECT 1 AS ok').get(); return true; } catch { return false; } },
    describe() { return enabled ? { engine: 'sqlite', file: path.basename(file), lastSavedAt } : 'disabled'; },
  };
}
