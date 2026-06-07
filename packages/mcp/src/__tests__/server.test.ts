// packages/mcp/src/__tests__/server.test.ts
import { describe, it, expect } from 'vitest';
import type { AddressInfo } from 'node:net';
import { closeSSEHandle, createAMPServer } from '../server.js';
import { TOOL_NAMES, DOMAIN_TOOL_NAMES_MAP, ALWAYS_ON_TOOL_NAMES } from '../tools.js';

async function withSseServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const previousToken = process.env.AMP_API_TOKEN;
  const previousUnauthenticated = process.env.AMP_ALLOW_UNAUTHENTICATED;
  process.env.AMP_API_TOKEN = 'test-health-token';
  delete process.env.AMP_ALLOW_UNAUTHENTICATED;

  const amp = createAMPServer();
  const handle = await amp.startSSE(0);
  const address = handle.httpServer.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await closeSSEHandle(handle, 500);
    if (previousToken === undefined) {
      delete process.env.AMP_API_TOKEN;
    } else {
      process.env.AMP_API_TOKEN = previousToken;
    }
    if (previousUnauthenticated === undefined) {
      delete process.env.AMP_ALLOW_UNAUTHENTICATED;
    } else {
      process.env.AMP_ALLOW_UNAUTHENTICATED = previousUnauthenticated;
    }
  }
}

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
    expect(amp.toolNames).toContain('berry_load');
    expect(amp.toolNames).toContain('berry_store');
    expect(amp.toolNames).toContain('berry_query');
    expect(amp.toolNames).toContain('berry_consolidate');
    expect(amp.toolNames).toContain('berry_resolve');
    expect(amp.toolNames).toContain('berry_bootstrap');
    // Progressive disclosure gateway
    expect(amp.toolNames).toContain('berry_tools');
    // Retrieval tier 1
    expect(amp.toolNames).toContain('berry_context');
    // Wiki tools (registered but disabled by default)
    expect(amp.toolNames).toContain('berry_compile');
    expect(amp.toolNames).toContain('berry_ingest');
    expect(amp.toolNames).toContain('berry_lint');
    // Extension tools registered from research, arch, code, retrieval, wiki
    expect(amp.toolNames.length).toBeGreaterThanOrEqual(6);
  });

  it('REBRAND-GUARD: the tool surface is exactly 49 berry_* tools with no legacy amp_* names', () => {
    const amp = createAMPServer();
    const names = [...amp.toolNames];
    // Clean cutover: every tool is canonical berry_*; no amp_* survives.
    expect(names.every((n) => n.startsWith('berry_'))).toBe(true);
    expect(names.some((n) => n.startsWith('amp_'))).toBe(false);
    // 8 always-on (Tier 1) + 41 on-demand (Tier 2) = 49.
    expect(names.length).toBe(49);
    expect(ALWAYS_ON_TOOL_NAMES.length).toBe(8);
    expect(Object.values(DOMAIN_TOOL_NAMES_MAP).flat().length).toBe(41);
  });

  it('berry_provenance is registered and discoverable in the admin domain', () => {
    const amp = createAMPServer();
    expect(amp.toolNames).toContain('berry_provenance');
    expect(DOMAIN_TOOL_NAMES_MAP.admin).toContain('berry_provenance');
  });

  it('DRIFT-GUARD: every registered tool is either Tier 1 or listed in DOMAIN_TOOL_NAMES_MAP', () => {
    // The berry_tools(action:"list") gateway reads DOMAIN_TOOL_NAMES_MAP. If a tool
    // is registered (server.tool) but missing from the map AND not Tier 1, an
    // agent can never discover it via the gateway. This guards both directions:
    // no registered tool is unlisted, and no map entry is a phantom.
    const amp = createAMPServer();
    const registered = new Set(amp.toolNames);
    const accountedFor = new Set<string>([
      ...ALWAYS_ON_TOOL_NAMES,
      ...Object.values(DOMAIN_TOOL_NAMES_MAP).flat(),
    ]);

    const registeredButUnlisted = [...registered].filter((t) => !accountedFor.has(t));
    const listedButUnregistered = [...accountedFor].filter((t) => !registered.has(t));

    expect(registeredButUnlisted).toEqual([]);
    expect(listedButUnregistered).toEqual([]);
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

  it('serves unauthenticated liveness without exposing auth material', async () => {
    await withSseServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/healthz`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');

      const body = await response.json() as Record<string, unknown>;
      expect(body).toMatchObject({
        status: 'ok',
        service: 'memberry-mcp',
        transport: 'sse',
        active_sessions: 0,
        auth_required: true,
      });
      expect(body.uptime_ms).toEqual(expect.any(Number));
      expect(body.token).toBeUndefined();
      expect(body.authorization).toBeUndefined();
    });
  });

  it('requires Bearer auth for readiness and returns non-streaming status', async () => {
    await withSseServer(async (baseUrl) => {
      const unauthenticated = await fetch(`${baseUrl}/readyz`);
      expect(unauthenticated.status).toBe(401);

      const authenticated = await fetch(`${baseUrl}/readyz`, {
        headers: { authorization: 'Bearer test-health-token' },
      });
      expect(authenticated.status).toBe(200);

      const body = await authenticated.json() as Record<string, unknown>;
      expect(body).toMatchObject({
        status: 'ready',
        service: 'memberry-mcp',
        transport: 'sse',
        active_sessions: 0,
        auth_required: true,
      });
    });
  });

  it('accepts any configured per-actor token and rejects unknown ones', async () => {
    const saved = {
      tokens: process.env.MEMBERRY_API_TOKENS,
      ampTok: process.env.AMP_API_TOKEN,
      memTok: process.env.MEMBERRY_API_TOKEN,
    };
    delete process.env.AMP_API_TOKEN;
    delete process.env.MEMBERRY_API_TOKEN;
    process.env.MEMBERRY_API_TOKENS = 'alice:tok-alice,bob:tok-bob';

    const amp = createAMPServer();
    const handle = await amp.startSSE(0);
    const address = handle.httpServer.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const alice = await fetch(`${baseUrl}/readyz`, { headers: { authorization: 'Bearer tok-alice' } });
      expect(alice.status).toBe(200);
      const bob = await fetch(`${baseUrl}/readyz`, { headers: { authorization: 'Bearer tok-bob' } });
      expect(bob.status).toBe(200);
      const wrong = await fetch(`${baseUrl}/readyz`, { headers: { authorization: 'Bearer not-a-real-token' } });
      expect(wrong.status).toBe(401);
      const none = await fetch(`${baseUrl}/readyz`);
      expect(none.status).toBe(401);
    } finally {
      await closeSSEHandle(handle, 500);
      if (saved.tokens === undefined) delete process.env.MEMBERRY_API_TOKENS; else process.env.MEMBERRY_API_TOKENS = saved.tokens;
      if (saved.ampTok !== undefined) process.env.AMP_API_TOKEN = saved.ampTok;
      if (saved.memTok !== undefined) process.env.MEMBERRY_API_TOKEN = saved.memTok;
    }
  });

  it('serves Codex-compatible Streamable HTTP sessions on /mcp', async () => {
    await withSseServer(async (baseUrl) => {
      const baseHeaders = {
        authorization: 'Bearer test-health-token',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      };

      const initialize = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'codex-test', version: '0.0.0' },
          },
        }),
      });

      expect(initialize.status).toBe(200);
      expect(initialize.headers.get('content-type')).toContain('application/json');

      const sessionId = initialize.headers.get('mcp-session-id');
      expect(sessionId).toEqual(expect.any(String));

      const initializeBody = await initialize.json() as {
        jsonrpc?: string;
        id?: number;
        result?: { protocolVersion?: string; serverInfo?: { name?: string } };
      };
      expect(initializeBody).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        result: { serverInfo: { name: 'memberry-mcp' } },
      });

      const sessionHeaders = {
        ...baseHeaders,
        'mcp-session-id': sessionId ?? '',
        'mcp-protocol-version': initializeBody.result?.protocolVersion ?? '2025-03-26',
      };

      const initialized = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: sessionHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        }),
      });
      expect(initialized.status).toBe(202);

      const tools = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: sessionHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
        }),
      });

      expect(tools.status).toBe(200);
      const toolsBody = await tools.json() as { result?: { tools?: Array<{ name?: string }> } };
      expect(toolsBody.result?.tools?.some((tool) => tool.name === 'berry_load')).toBe(true);
    });
  });

  it('closes active SSE sessions before waiting for the HTTP server to drain', async () => {
    const previousToken = process.env.AMP_API_TOKEN;
    process.env.AMP_API_TOKEN = 'test-shutdown-token';

    const amp = createAMPServer();
    const handle = await amp.startSSE(0);
    const address = handle.httpServer.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    let response: Response | undefined;

    try {
      response = await fetch(`${baseUrl}/sse`, {
        headers: { authorization: 'Bearer test-shutdown-token' },
      });
      expect(response.status).toBe(200);
      expect(handle.transports.size).toBe(1);

      await closeSSEHandle(handle, 500);

      expect(handle.transports.size).toBe(0);
      expect(handle.servers.size).toBe(0);
      expect(handle.httpServer.listening).toBe(false);
    } finally {
      await response?.body?.cancel().catch(() => {});
      await closeSSEHandle(handle, 500).catch(() => {});
      if (previousToken === undefined) {
        delete process.env.AMP_API_TOKEN;
      } else {
        process.env.AMP_API_TOKEN = previousToken;
      }
    }
  });
});
