// Offline Resilience Mutation Queue for Pulse Fitness

const QUEUE_STORAGE_KEY = 'pulse_fitness_mutation_queue_v1';

export interface QueuedMutationItem {
  id: string;
  type: string;
  variables: any;
  endpoint?: string;
  method?: string;
  timestamp: number;
}

export function getLocalMutationQueue(): QueuedMutationItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to read mutation queue:', e);
    return [];
  }
}

export function saveLocalMutationQueue(queue: QueuedMutationItem[]): void {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Failed to save mutation queue:', e);
  }
}

export async function enqueueMutation(payload: {
  type: string;
  variables: any;
  endpoint?: string;
  method?: string;
  timestamp?: number;
}): Promise<string> {
  const queue = getLocalMutationQueue();
  const newItem: QueuedMutationItem = {
    id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type: payload.type,
    variables: payload.variables,
    endpoint: payload.endpoint,
    method: payload.method || 'POST',
    timestamp: payload.timestamp || Date.now(),
  };

  queue.push(newItem);
  saveLocalMutationQueue(queue);
  console.log(`[OfflineQueue] Enqueued mutation ${newItem.type} (${newItem.id})`);
  return newItem.id;
}

export async function processQueue(
  executor: (item: QueuedMutationItem) => Promise<void>
): Promise<{ processed: number; failed: number }> {
  const queue = getLocalMutationQueue();
  if (queue.length === 0) return { processed: 0, failed: 0 };

  let processedCount = 0;
  let failedCount = 0;
  const remainingQueue: QueuedMutationItem[] = [];

  for (const item of queue) {
    try {
      await executor(item);
      processedCount++;
    } catch (err) {
      console.warn(`[OfflineQueue] Failed to replay mutation ${item.id}, retaining in queue:`, err);
      failedCount++;
      remainingQueue.push(item);
      // Stop on first failure to preserve sequence integrity
      const unattempted = queue.slice(queue.indexOf(item) + 1);
      remainingQueue.push(...unattempted);
      break;
    }
  }

  saveLocalMutationQueue(remainingQueue);
  return { processed: processedCount, failed: failedCount };
}

// Global window event listener when device reconnects
export function startOfflineListener(executor: (item: QueuedMutationItem) => Promise<void>) {
  if (typeof window === 'undefined') return;

  const handleOnline = async () => {
    console.log('[OfflineQueue] Device returned ONLINE. Replaying queued mutations...');
    const result = await processQueue(executor);
    if (result.processed > 0) {
      console.log(`[OfflineQueue] Successfully synced ${result.processed} mutations.`);
    }
  };

  window.addEventListener('online', handleOnline);
  return () => window.removeEventListener('online', handleOnline);
}
