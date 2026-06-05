// packages/mcp/src/__tests__/tool-registration.regression.test.ts
//
// BUG: amp_store (and every other mutating tool) threw "typedHandler is not a
// function" on every call, while read tools worked. Root cause was NOT the
// service/connection — it was tool *registration*. Mutating tools were
// registered with an empty `{}` as the ToolAnnotations argument:
//
//     server.tool('amp_store', desc, AmpStoreSchema, {}, handlers.amp_store)
//
// The MCP SDK's server.tool() overload parser treats an empty object as a
// zero-param Zod raw shape (isZodRawShapeCompat({}) === true), so the `{}` is
// never consumed as annotations. The handler then lands in the annotations
// slot and the *annotations* land in the callback slot — making the registered
// handler the object `{}`, which is not callable.
//
// The existing tools.test.ts exercised buildToolHandlers() directly and so
// never went through server.tool(), which is why it stayed green. This test
// goes through the real registration path and asserts every wired handler is
// callable — guarding the whole class, not just amp_store.
import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerTools,
  setServiceInstances,
  type IAMPService,
  type IConsolidationEngine,
  type IScopedQuery,
  type IMemoryBlockService,
} from '../tools.js';

const ampService: IAMPService = {
  load: async () => ({ markdown: '# ctx', tokens: 1, sources: [], assembled_at: 't' }),
  store: async () => ({ id: 'ep-1', duplicate: false }),
};
const consolidationEngine: IConsolidationEngine = {
  run: async () => ({}), status: async () => ({}),
  review: async () => ({}), apply: async () => ({ applied: true }),
};
const scopedQuery: IScopedQuery = { rawCypher: async () => [] };
const memoryBlockService: IMemoryBlockService = {
  read: async () => null,
  insert: async () => ({ id: 'b', name: 'persona', tier: 'core', content: 'x', scope: 's' }),
  replace: async () => ({ id: 'b', name: 'persona', tier: 'core', content: 'x', scope: 's' }),
  rewrite: async () => ({ id: 'b', name: 'persona', tier: 'core', content: 'x', scope: 's' }),
  promote: async () => ({ id: 'b', name: 'persona', tier: 'core', content: 'x', scope: 's' }),
  archive: async () => 'archived',
};

beforeEach(() => {
  setServiceInstances({ ampService, consolidationEngine, scopedQuery, memoryBlockService });
});

// Reach into the SDK's registry to read what actually got wired as each
// tool's handler. With the bug, mutating tools' handler === {} (not a function).
function registeredHandlers(server: McpServer): Record<string, unknown> {
  const reg = (server as unknown as { _registeredTools: Record<string, { handler: unknown }> })._registeredTools;
  return Object.fromEntries(Object.entries(reg).map(([name, t]) => [name, t.handler]));
}

describe('tool registration regression (typedHandler is not a function)', () => {
  it('registers every core tool with a callable handler', () => {
    const server = new McpServer({ name: 'amp-mcp-test', version: '0.0.0' });
    registerTools(server);

    const handlers = registeredHandlers(server);
    expect(Object.keys(handlers).length).toBeGreaterThan(0);

    const notFunctions = Object.entries(handlers)
      .filter(([, h]) => typeof h !== 'function')
      .map(([name]) => name);

    // Any non-function handler is the empty-annotations misparse.
    expect(notFunctions).toEqual([]);
  });

  it('the originally-broken mutating tools have function handlers', () => {
    const server = new McpServer({ name: 'amp-mcp-test', version: '0.0.0' });
    registerTools(server);
    const handlers = registeredHandlers(server);

    for (const name of [
      'amp_store',
      'amp_memory_insert',
      'amp_memory_replace',
      'amp_memory_rewrite',
      'amp_memory_promote',
      'amp_consolidate',
    ]) {
      expect(typeof handlers[name], `${name} handler should be a function`).toBe('function');
    }
  });

  it('invoking the registered amp_store handler succeeds (original repro)', async () => {
    const server = new McpServer({ name: 'amp-mcp-test', version: '0.0.0' });
    registerTools(server);
    const handler = registeredHandlers(server)['amp_store'] as (
      args: unknown,
      extra: unknown,
    ) => Promise<{ content: Array<{ text: string }> }>;

    expect(typeof handler).toBe('function');
    const result = await handler(
      { session_id: 's', task: 't', content: 'c' },
      {},
    );
    expect(result.content[0].text).toContain('ep-1');
  });
});
