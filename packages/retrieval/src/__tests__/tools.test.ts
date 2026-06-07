// packages/retrieval/src/__tests__/tools.test.ts
// Tenant-isolation wiring for the retrieval tool layer: the container carries a
// tenantId and registerRetrievalTools threads it into every assemble()/ask().
import { describe, it, expect, vi } from 'vitest';
import {
  createRetrievalContainer,
  registerRetrievalTools,
  type IUnifiedAssembler,
  type IFeedbackTracker,
} from '../tools.js';
import type { UnifiedContext } from '../types.js';

function emptyCtx(): UnifiedContext {
  return { task: 'q', strategy: 'ranked', sections: [], token_count: 0, assembled_at: '2026-06-07T00:00:00.000Z' };
}

function makeAssembler(): IUnifiedAssembler {
  return {
    assemble: vi.fn().mockResolvedValue(emptyCtx()),
    renderMarkdown: vi.fn().mockReturnValue('# md'),
    ask: vi.fn().mockResolvedValue({ answer: 'a', cited_ids: [], evidence: [], level: 'medium' }),
  };
}

function makeFeedback(): IFeedbackTracker {
  return { recordFeedback: vi.fn().mockResolvedValue(undefined) };
}

/**
 * Minimal McpServer stub: server.tool(name, desc, schema, annotations, handler)
 * captures each registered handler by tool name so we can invoke it directly.
 */
function makeServerStub() {
  const handlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
  const server = {
    tool: vi.fn((name: string, ...rest: unknown[]) => {
      const handler = rest[rest.length - 1] as (args: Record<string, unknown>) => Promise<unknown>;
      handlers.set(name, handler);
      return { enable: vi.fn(), disable: vi.fn() } as unknown;
    }),
  };
  return { server, handlers };
}

describe('registerRetrievalTools — tenant threading', () => {
  it('createRetrievalContainer defaults tenantId to the default tenant', () => {
    expect(createRetrievalContainer().tenantId).toBe('default');
    expect(createRetrievalContainer({ tenantId: 'acme' }).tenantId).toBe('acme');
  });

  it('berry_context passes the container tenantId into assemble()', async () => {
    const assembler = makeAssembler();
    const { server, handlers } = makeServerStub();
    const container = createRetrievalContainer({ assembler, feedbackTracker: makeFeedback(), tenantId: 'acme' });

    registerRetrievalTools(server as never, container);
    await handlers.get('berry_context')!({ task: 'find auth', strategy: 'auto' });

    expect(assembler.assemble).toHaveBeenCalledWith(
      'find auth',
      expect.objectContaining({ tenantId: 'acme' }),
    );
  });

  it('berry_ask passes the container tenantId into ask()', async () => {
    const assembler = makeAssembler();
    const { server, handlers } = makeServerStub();
    const container = createRetrievalContainer({ assembler, feedbackTracker: makeFeedback(), tenantId: 'acme' });

    registerRetrievalTools(server as never, container);
    await handlers.get('berry_ask')!({ question: 'does X use Y?', reasoning_level: 'medium' });

    expect(assembler.ask).toHaveBeenCalledWith(
      'does X use Y?',
      expect.objectContaining({ tenantId: 'acme' }),
    );
  });

  it('defaults to the default tenant when none is supplied to the container', async () => {
    const assembler = makeAssembler();
    const { server, handlers } = makeServerStub();
    const container = createRetrievalContainer({ assembler, feedbackTracker: makeFeedback() });

    registerRetrievalTools(server as never, container);
    await handlers.get('berry_context')!({ task: 't', strategy: 'auto' });

    expect(assembler.assemble).toHaveBeenCalledWith(
      't',
      expect.objectContaining({ tenantId: 'default' }),
    );
  });
});
