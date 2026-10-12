// src/lib/offline/outbox.ts
import { get, set } from 'idb-keyval';

export type OutboxOp =
  | {
      id: string;
      type: 'register_day_entry';
      createdAt: string;
      status: 'pending' | 'syncing' | 'failed';
      attempts: number;
      lastError?: string;
      payload: {
        p_entry_type: 'new' | 'renewal' | 'balance' | 'freeze';
        p_full_name: string;
        p_phone: string;
        p_gender?: string | null;
        p_months?: number | null;
        p_freeze_days?: number | null;
        p_amount: number;
        p_method: string;
        p_list_price?: number | null;
        p_branch_id?: string | null;
        p_notes?: string | null;
        p_idempotency_key: string;
      };
    }
  | {
      id: string;
      type: 'check_in';
      createdAt: string;
      status: 'pending' | 'syncing' | 'failed';
      attempts: number;
      lastError?: string;
      payload: {
        member_id: string;
        branch_id?: string | null;
        notes?: string | null;
        day_key: string;
        actor_id?: string | null;
        promise_preset?: string | null;
      };
    };

const STORAGE_KEY = 'pulse_outbox_v1';
const listeners = new Set<(count: number) => void>();

function notifyListeners(count: number) {
  listeners.forEach((cb) => {
    try {
      cb(count);
    } catch (e) {
      console.warn('Error in outbox listener:', e);
    }
  });
}

export function onOutboxChange(callback: (count: number) => void) {
  listeners.add(callback);
  readOutbox().then((ops) => callback(ops.length));
  return () => {
    listeners.delete(callback);
  };
}

export async function readOutbox(): Promise<OutboxOp[]> {
  try {
    const data = await get<OutboxOp[]>(STORAGE_KEY);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('Could not read from IndexedDB, trying localStorage fallback:', err);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

export async function writeOutbox(ops: OutboxOp[]) {
  try {
    await set(STORAGE_KEY, ops);
  } catch (err) {
    console.warn('Could not write to IndexedDB, fallback to localStorage:', err);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ops));
    } catch {}
  }
  notifyListeners(ops.length);
}

export async function enqueue(op: OutboxOp) {
  const ops = await readOutbox();
  ops.push(op);
  await writeOutbox(ops);
  return op;
}

export async function updateOp(id: string, patch: Partial<OutboxOp>) {
  const ops = await readOutbox();
  const next = ops.map((o) => (o.id === id ? ({ ...o, ...patch } as OutboxOp) : o));
  await writeOutbox(next);
}

export async function removeOp(id: string) {
  const ops = await readOutbox();
  const remaining = ops.filter((o) => o.id !== id);
  await writeOutbox(remaining);
}
