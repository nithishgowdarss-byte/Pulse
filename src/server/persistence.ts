import fs from 'fs';
import path from 'path';

export interface PersistenceOptions {
  dataDir: string;
  enabled?: boolean;
  snapshot: () => Record<string, unknown>;
  restore: (data: Record<string, any>) => void;
  intervalMs?: number;
}

/** Durable JSON snapshot store with atomic writes (tmp + rename) and a debounced flush. */
export function createPersistence(opts: PersistenceOptions) {
  const enabled = opts.enabled !== false;
  const file = path.join(opts.dataDir, 'pulse-db.json');
  let dirty = false;
  let timer: NodeJS.Timeout | null = null;
  let lastSavedAt: string | null = null;

  function flush() {
    if (!enabled || !dirty) return false;
    fs.mkdirSync(opts.dataDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), data: opts.snapshot() }), { mode: 0o600 });
    fs.renameSync(tmp, file);
    dirty = false;
    lastSavedAt = new Date().toISOString();
    return true;
  }

  return {
    file,
    load() {
      if (!enabled || !fs.existsSync(file)) return false;
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (parsed && parsed.data && typeof parsed.data === 'object') {
          opts.restore(parsed.data);
          console.log(`[persistence] restored from ${file} (saved ${parsed.savedAt})`);
          return true;
        }
      } catch (err: any) {
        const bad = `${file}.corrupt-${Date.now()}`;
        fs.renameSync(file, bad);
        console.error(`[persistence] corrupt snapshot moved to ${bad}: ${err?.message}`);
      }
      return false;
    },
    markDirty() {
      if (!enabled) return;
      dirty = true;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          try { flush(); } catch (err: any) { console.error('[persistence] flush failed', err?.message); }
        }, opts.intervalMs ?? 1000);
        timer.unref?.();
      }
    },
    flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      try { return flush(); } catch (err: any) { console.error('[persistence] flush failed', err?.message); return false; }
    },
    describe() {
      return enabled ? { file: path.basename(file), lastSavedAt } : 'disabled';
    },
  };
}
