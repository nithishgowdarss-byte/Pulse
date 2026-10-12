// src/lib/offline/syncEngine.ts
import { callRpc } from '../rpc';
import { readOutbox, updateOp, removeOp, type OutboxOp } from './outbox';
import { toast } from '../toast';

let running = false;
const syncListeners = new Set<(isSyncing: boolean) => void>();

export function onSyncStateChange(callback: (isSyncing: boolean) => void) {
  syncListeners.add(callback);
  callback(running);
  return () => {
    syncListeners.delete(callback);
  };
}

function setRunning(val: boolean) {
  running = val;
  syncListeners.forEach((fn) => fn(val));
}

async function processOne(op: OutboxOp) {
  await updateOp(op.id, { status: 'syncing', attempts: op.attempts + 1 });

  if (op.type === 'register_day_entry') {
    await callRpc('register_day_entry', op.payload, {
      context: 'outbox_register',
    });
  } else if (op.type === 'check_in') {
    await callRpc('check_in_with_override', {
      p_member_id: op.payload.member_id,
      p_notes: op.payload.notes || 'Offline QR Check-in sync',
      p_promise_preset: op.payload.promise_preset || null,
      p_actor_id: op.payload.actor_id || null,
      p_day_key: op.payload.day_key,
    }, { context: 'outbox_checkin' });
  }

  await removeOp(op.id);
}

export async function flushOutbox() {
  if (running) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const ops = await readOutbox();
  if (ops.length === 0) return;

  setRunning(true);
  let syncedCount = 0;

  try {
    for (const op of ops) {
      if (op.status === 'syncing' && op.attempts > 5) continue;
      try {
        await processOne(op);
        syncedCount++;
      } catch (e: any) {
        const msg = String(e?.message || e);
        // Permanent failures: drop or mark failed
        if (
          /INVALID_PHONE|FORBIDDEN|MEMBER_NOT_FOUND|ALREADY_CHECKED_IN|VALIDATION/i.test(msg)
        ) {
          console.warn(`[Sync] Permanent failure for op ${op.id}:`, msg);
          await updateOp(op.id, {
            status: 'failed',
            lastError: msg,
          });
          // Remove permanently failed op after 3 attempts
          if (op.attempts >= 3) {
            await removeOp(op.id);
          }
          continue;
        }

        await updateOp(op.id, {
          status: 'pending',
          lastError: msg,
        });

        // Stop batch on transient network disconnect
        if (/NETWORK|fetch|Load failed|Failed to fetch/i.test(msg)) {
          break;
        }
      }
    }

    if (syncedCount > 0) {
      toast.success(`Synced ${syncedCount} queued action(s) with server!`);
    }
  } finally {
    setRunning(false);
  }
}

export function startOutboxListener() {
  if (typeof window === 'undefined') return;

  window.addEventListener('online', () => {
    console.info('[Sync] Network connection restored. Flushing outbox...');
    void flushOutbox();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      void flushOutbox();
    }
  });

  // Background interval check
  setInterval(() => {
    if (navigator.onLine) {
      void flushOutbox();
    }
  }, 25_000);
}
