// packages/core/src/__tests__/hooks-safe-load.test.ts
import { describe, it, expect } from 'vitest';
import { safeLoad } from '../hooks/safe-load.js';
import type { LoadScope, MemoryContext } from '../types.js';

const scope: LoadScope = { task: 't' };
const ctx: MemoryContext = { markdown: '# ctx', tokens: 1, sources: ['s1'], assembled_at: 'now' };

describe('safeLoad (fail-open)', () => {
  it('returns the context when load resolves in time', async () => {
    const svc = { load: async () => ctx };
    expect(await safeLoad(svc, scope, 500)).toEqual(ctx);
  });

  it('returns null when load exceeds the timeout (never blocks the turn)', async () => {
    const svc = { load: () => new Promise<MemoryContext>(() => { /* never resolves */ }) };
    const start = Date.now();
    const result = await safeLoad(svc, scope, 80);
    expect(result).toBeNull();
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('returns null when load throws', async () => {
    const svc = { load: async () => { throw new Error('neo4j down'); } };
    expect(await safeLoad(svc, scope, 500)).toBeNull();
  });
});
