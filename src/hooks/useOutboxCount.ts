// src/hooks/useOutboxCount.ts
import { useEffect, useState } from 'react';
import { onOutboxChange } from '../lib/offline/outbox';

export function useOutboxCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const unsub = onOutboxChange((n) => setCount(n));
    return unsub;
  }, []);

  return count;
}
