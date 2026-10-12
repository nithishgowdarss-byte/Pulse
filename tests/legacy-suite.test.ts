import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
});

describe('legacy useOptimisticMutation suite', () => {
  it('all embedded checks pass', async () => {
    const { runOptimisticMutationTestSuite } = await import('../src/hooks/__tests__/useOptimisticMutation.test');
    const results = runOptimisticMutationTestSuite();
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(r.passed, `${r.name}: ${r.message}`).toBe(true);
  });
});
