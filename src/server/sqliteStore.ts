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
    /** Consistent point-in-time copy of the whole database (flushes pending writes first). */
    backup(dest: string): { file: string; bytes: number } {
      if (!enabled) throw new Error('Storage is disabled');
      ensureDb();
      if (timer) { clearTimeout(timer); timer = null; }
      if (dirty) { writeAll(opts.snapshot()); dirty = false; lastSavedAt = new Date().toISOString(); }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      db.prepare('VACUUM INTO ?').run(dest);
      try { fs.chmodSync(dest, 0o600); } catch {}
      return { file: dest, bytes: fs.statSync(dest).size };
    },
    /** Replace all data with a validated backup. Keeps a pre-restore copy of the current DB. */
    restoreFrom(data: Record<string, any>, keepCopyAt?: string) {
      if (!enabled) throw new Error('Storage is disabled');
      ensureDb();
      if (keepCopyAt) this.backup(keepCopyAt);
      writeAll(data, true);
      // drop collections that are not in the backup
      const keep = new Set(Object.keys(data));
      for (const m of db.prepare('SELECT collection FROM collection_meta').all()) {
        if (!keep.has(m.collection)) { db.prepare('DELETE FROM documents WHERE collection = ?').run(m.collection); db.prepare('DELETE FROM collection_meta WHERE collection = ?').run(m.collection); hashes.delete(m.collection); }
      }
      opts.restore(data);
      lastSavedAt = new Date().toISOString();
    },
    describe() { return enabled ? { engine: 'sqlite', file: path.basename(file), lastSavedAt } : 'disabled'; },
  };
}

export const REQUIRED_COLLECTIONS = ['branches', 'profiles', 'members'];
export type BackupCheck = { ok: boolean; error?: string; data?: any; summary?: Record<string, number>; schemaVersion?: number };

/** Open an uploaded backup read-only and prove it is a sane Pulse database before anything is replaced. */
export function validateBackupFile(file: string, maxSchema = MIGRATIONS[MIGRATIONS.length - 1].id): BackupCheck {
  let head: Buffer;
  try { head = Buffer.alloc(16); const fd = fs.openSync(file, 'r'); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd); } catch { return { ok: false, error: 'Could not read the uploaded file.' }; }
  if (head.toString('latin1') !== 'SQLite format 3\u0000') return { ok: false, error: 'This is not a Pulse backup (not an SQLite database file).' };
  let db: any;
  try {
    const { DatabaseSync } = require_('node:sqlite');
    db = new DatabaseSync(file, { readOnly: true });
    const integ = db.prepare('PRAGMA integrity_check').get();
    if (!integ || Object.values(integ)[0] !== 'ok') return { ok: false, error: 'The backup file is damaged (integrity check failed).' };
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name));
    for (const t of ['documents', 'collection_meta', 'schema_migrations']) if (!tables.has(t)) return { ok: false, error: `Not a Pulse backup (missing table ${t}).` };
    const ver = (db.prepare('SELECT MAX(id) AS v FROM schema_migrations').get()?.v as number) || 0;
    if (ver > maxSchema) return { ok: false, error: `This backup is from a newer Pulse version (schema ${ver}). Update Pulse first.` };
    const metas = db.prepare('SELECT collection, kind FROM collection_meta').all();
    const data: Record<string, any> = {};
    const rows = db.prepare('SELECT doc_id, data FROM documents WHERE collection = ? ORDER BY rowid');
    for (const m of metas) {
      const r = rows.all(m.collection);
      try {
        data[m.collection] = m.kind === 'array' ? r.map((x: any) => JSON.parse(x.data)) : Object.fromEntries(r.map((x: any) => [x.doc_id, JSON.parse(x.data)]));
      } catch { return { ok: false, error: `The backup has unreadable records in "${m.collection}".` }; }
    }
    for (const c of REQUIRED_COLLECTIONS) if (!Array.isArray(data[c]) || data[c].length === 0) return { ok: false, error: `The backup has no ${c} — refusing to restore an empty gym.` };
    if (!data.members.every((m: any) => m && typeof m.id === 'string' && typeof m.full_name === 'string')) return { ok: false, error: 'The backup has malformed member records.' };
    const summary = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.keys(v || {}).length]));
    return { ok: true, data, summary, schemaVersion: ver };
  } catch (e: any) {
    return { ok: false, error: `Could not open the backup: ${String(e?.message || e).slice(0, 120)}` };
  } finally { try { db?.close(); } catch {} }
}
