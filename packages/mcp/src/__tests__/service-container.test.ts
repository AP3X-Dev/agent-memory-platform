// packages/mcp/src/__tests__/service-container.test.ts
//
// Proves the global-injection anti-pattern is gone: tool handlers can be bound to
// an EXPLICIT ServiceContainer (not the process-default), so two instances with
// different services stay isolated — the seam multi-tenant / per-session
// deployments need. None of this touches setServiceInstances().

import { describe, it, expect, vi } from 'vitest';
import { buildToolHandlers, createServiceContainer } from '../tools.js';
import type { IAMPService } from '../tools.js';

function ampReturning(markdown: string): IAMPService {
  return {
    load: vi.fn().mockResolvedValue({ markdown, tokens: 1, sources: [], assembled_at: 'now' }),
    store: vi.fn().mockResolvedValue({ id: 'x', duplicate: false }),
  };
}

describe('ServiceContainer dependency injection', () => {
  it('binds handlers to the container passed in, not a global singleton', async () => {
    const tenantA = createServiceContainer({ ampService: ampReturning('CONTEXT_A') });
    const tenantB = createServiceContainer({ ampService: ampReturning('CONTEXT_B') });

    const handlersA = buildToolHandlers(tenantA);
    const handlersB = buildToolHandlers(tenantB);

    const a = await handlersA.berry_load({ task: 't' });
    const b = await handlersB.berry_load({ task: 't' });

    expect(a.content[0].text).toBe('CONTEXT_A');
    expect(b.content[0].text).toBe('CONTEXT_B');
    // Isolation: A's service was used for A, B's for B.
    expect(tenantA.ampService!.load).toHaveBeenCalledTimes(1);
    expect(tenantB.ampService!.load).toHaveBeenCalledTimes(1);
  });

  it('a missing service in the container yields a clear not-initialised error', async () => {
    const empty = createServiceContainer(); // all null
    const handlers = buildToolHandlers(empty);
    await expect(handlers.berry_load({ task: 't' })).rejects.toThrow(/not initialised/i);
  });

  it('createServiceContainer defaults all unspecified services to null', () => {
    const c = createServiceContainer({ ampService: ampReturning('x') });
    expect(c.ampService).not.toBeNull();
    expect(c.scopedQuery).toBeNull();
    expect(c.consolidationEngine).toBeNull();
    expect(c.provenanceTraversal).toBeNull();
  });
});
