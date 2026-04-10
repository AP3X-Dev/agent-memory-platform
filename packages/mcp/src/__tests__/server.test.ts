// packages/mcp/src/__tests__/server.test.ts
import { describe, it, expect } from 'vitest';
import { createAMPServer } from '../server.js';
import { TOOL_NAMES } from '../tools.js';

describe('createAMPServer', () => {
  it('returns an AMPMCPServer object', () => {
    const amp = createAMPServer();
    expect(amp).toBeDefined();
    expect(amp.server).toBeDefined();
    expect(typeof amp.startSSE).toBe('function');
    expect(typeof amp.startStdio).toBe('function');
  });

  it('exposes toolNames with all registered tools', () => {
    const amp = createAMPServer();
    expect(amp.toolNames).toBeDefined();
    // Core tools
    expect(amp.toolNames).toContain('amp_load');
    expect(amp.toolNames).toContain('amp_store');
    expect(amp.toolNames).toContain('amp_query');
    expect(amp.toolNames).toContain('amp_consolidate');
    expect(amp.toolNames).toContain('amp_resolve');
    expect(amp.toolNames).toContain('amp_bootstrap');
    // Progressive disclosure gateway
    expect(amp.toolNames).toContain('amp_tools');
    // Retrieval tier 1
    expect(amp.toolNames).toContain('amp_context');
    // Wiki tools (registered but disabled by default)
    expect(amp.toolNames).toContain('amp_compile');
    expect(amp.toolNames).toContain('amp_ingest');
    expect(amp.toolNames).toContain('amp_lint');
    // Extension tools registered from research, arch, code, retrieval, wiki
    expect(amp.toolNames.length).toBeGreaterThanOrEqual(6);
  });

  it('server is a McpServer instance', () => {
    const amp = createAMPServer();
    // McpServer has a .server property (the underlying Server) and a .connect method
    expect(typeof amp.server.connect).toBe('function');
    expect(typeof amp.server.close).toBe('function');
  });

  it('can create multiple server instances independently', () => {
    const amp1 = createAMPServer();
    const amp2 = createAMPServer();
    // Each call produces a distinct server object
    expect(amp1.server).not.toBe(amp2.server);
  });
});
