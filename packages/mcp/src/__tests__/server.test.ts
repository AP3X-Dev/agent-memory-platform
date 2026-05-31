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

  it('amp_provenance is registered and discoverable in the admin domain', () => {
    const amp = createAMPServer();
    expect(amp.toolNames).toContain('amp_provenance');
    expect(DOMAIN_TOOL_NAMES_MAP.admin).toContain('amp_provenance');
  });

  it('DRIFT-GUARD: every registered tool is either Tier 1 or listed in DOMAIN_TOOL_NAMES_MAP', () => {
    // The amp_tools(action:"list") gateway reads DOMAIN_TOOL_NAMES_MAP. If a tool
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
        service: 'amp-mcp',
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
        service: 'amp-mcp',
        transport: 'sse',
        active_sessions: 0,
        auth_required: true,
      });
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
