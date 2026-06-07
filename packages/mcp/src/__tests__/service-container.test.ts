// packages/mcp/src/__tests__/service-container.test.ts
//
// Proves the global-injection anti-pattern is gone: tool handlers can be bound to
// an EXPLICIT ServiceContainer (not the process-default), so two instances with
// different services stay isolated — the seam multi-tenant / per-session
// deployments need. None of this touches setServiceInstances().

import { describe, it, expect, vi } from 'vitest';
import { buildToolHandlers, createServiceContainer, registerTools, TENANT_SAFE_TOOLS } from '../tools.js';
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

  it('defaults tenantId to "default"', () => {
    expect(createServiceContainer().tenantId).toBe('default');
    expect(createServiceContainer({ tenantId: 'acme' }).tenantId).toBe('acme');
  });
});

describe('Tenant binding', () => {
  it('threads the container tenant into store() and load()', async () => {
    const amp: IAMPService = {
      load: vi.fn().mockResolvedValue({ markdown: '', tokens: 0, sources: [], assembled_at: 'now' }),
      store: vi.fn().mockResolvedValue({ id: 'x', duplicate: false }),
    };
    const handlers = buildToolHandlers(createServiceContainer({ ampService: amp, tenantId: 'acme' }));

    await handlers.berry_store({ session_id: 's', task: 't', content: 'c' });
    await handlers.berry_load({ task: 't' });

    expect((amp.store as any).mock.calls[0][0].tenantId).toBe('acme');
    expect((amp.load as any).mock.calls[0][0].tenantId).toBe('acme');
  });
});

describe('Multi-tenant default-deny gate', () => {
  /** Minimal fake McpServer that captures registered tool handlers by name. */
  function fakeServer() {
    const captured: Record<string, (args: any) => Promise<{ content: Array<{ text: string }> }>> = {};
    const server: any = {
      tool: (name: string, ...rest: any[]) => {
        captured[name] = rest[rest.length - 1];
        return { enable: () => {}, disable: () => {} };
      },
    };
    return { server, captured };
  }

  it('refuses non-tenant-safe tools but serves tenant-safe ones', async () => {
    const amp = ampReturning('CTX');
    const container = createServiceContainer({ ampService: amp, tenantId: 'acme' });
    const { server, captured } = fakeServer();

    registerTools(server, new Map(), container, { multiTenant: true });

    // A tenant-safe tool runs normally…
    expect(TENANT_SAFE_TOOLS.has('berry_load')).toBe(true);
    const loaded = await captured['berry_load']({ task: 't' });
    expect(loaded.content[0].text).toBe('CTX');

    // grep is now tenant-scoped, so it IS in the safe set and runs.
    expect(TENANT_SAFE_TOOLS.has('berry_grep')).toBe(true);

    // …a not-yet-scoped admin tool (raw Cypher) is refused (default-deny).
    expect(TENANT_SAFE_TOOLS.has('berry_query')).toBe(false);
    const q = await captured['berry_query']({ query: 'MATCH (n) RETURN n', limit: 5 });
    expect(q.content[0].text).toMatch(/not available in multi-tenant mode/i);
  });

  it('does NOT gate in single-tenant mode (default)', async () => {
    const amp = ampReturning('CTX');
    const container = createServiceContainer({ ampService: amp });
    const { server, captured } = fakeServer();
    registerTools(server, new Map(), container); // no multiTenant
    // berry_grep is the real handler here (would hit scopedQuery, which is null → throws)
    await expect(captured['berry_grep']({ pattern: 'x' })).rejects.toThrow(/not initialised/i);
  });
});
