// packages/mcp/src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { registerTools, TOOL_NAMES } from './tools.js';
import type { ToolRegistry } from './tools.js';
import { registerResearchTools, RESEARCH_TOOL_NAMES } from '@amp/research';
import { registerArchTools, ARCH_TOOL_NAMES } from '@amp/arch';
import { registerCodeTools, CODE_TOOL_NAMES } from '@amp/code';
import { registerRetrievalTools, RETRIEVAL_TOOL_NAMES } from '@amp/retrieval';
import { registerWikiTools, WIKI_TOOL_NAMES } from '@amp/wiki';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SSEHandle {
  /** The underlying Node HTTP server. */
  httpServer: ReturnType<typeof createServer>;
  /** Active SSE transports keyed by session ID. */
  transports: Map<string, SSEServerTransport>;
  /** Per-session MCP servers keyed by session ID. */
  servers: Map<string, McpServer>;
}

export interface AMPMCPServer {
  /** The underlying McpServer instance. */
  server: McpServer;
  /** Names of all registered tools. */
  toolNames: readonly string[];
  /** Start listening via SSE (HTTP) on the given port. */
  startSSE(port?: number): Promise<SSEHandle>;
  /** Start listening via stdio. */
  startStdio(): Promise<void>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Register all tools on a server with progressive disclosure.
 * Returns the ToolRegistry for the amp_tools gateway.
 */
function registerAllTools(server: McpServer): ToolRegistry {
  const toolRegistry: ToolRegistry = new Map();

  // Register core tools — returns Tier 1 (always-on) + core domains (Tier 2)
  registerTools(server, toolRegistry);

  // Register satellite domain tools — all Tier 2
  const researchHandles = registerResearchTools(server);
  toolRegistry.set('research', researchHandles);

  const archHandles = registerArchTools(server);
  toolRegistry.set('arch', archHandles);

  const codeHandles = registerCodeTools(server);
  toolRegistry.set('code', codeHandles);

  const retrievalResult = registerRetrievalTools(server);
  // amp_context is Tier 1, amp_feedback is Tier 2
  const existingRetrieval = toolRegistry.get('retrieval') ?? [];
  existingRetrieval.push(...retrievalResult.tier2);
  toolRegistry.set('retrieval', existingRetrieval);

  const wikiHandles = registerWikiTools(server);
  toolRegistry.set('wiki', wikiHandles);

  // Disable all Tier 2 tools by default
  for (const handles of toolRegistry.values()) {
    for (const h of handles) h.disable();
  }

  return toolRegistry;
}

export function createAMPServer(): AMPMCPServer {
  const server = new McpServer({ name: 'amp-mcp', version: '0.1.0' });

  // Register all AMP tools with progressive disclosure
  registerAllTools(server);

  // ─── SSE transport ────────────────────────────────────────────────────────

  async function startSSE(port = 3101): Promise<SSEHandle> {
    const transports = new Map<string, SSEServerTransport>();
    const servers = new Map<string, McpServer>();

    // ── Security helpers ───────────────────────────────────────────────────
    const ALLOWED_ORIGINS = new Set([
      'http://localhost',
      'https://localhost',
      'http://127.0.0.1',
      'https://127.0.0.1',
      'http://[::1]',
      'https://[::1]',
    ]);

    /** Return true if the origin is localhost (with any port) or absent (non-browser). */
    function isOriginAllowed(origin: string | undefined): boolean {
      if (!origin) return true; // non-browser clients don't send Origin
      try {
        const parsed = new URL(origin);
        const bare = `${parsed.protocol}//${parsed.hostname}`;
        return ALLOWED_ORIGINS.has(bare);
      } catch (err: unknown) {
        console.error("[server] Suppressed error:", err);
        return false;
      }
    }

    // ── Auth token resolution ────────────────────────────────────────────
    // Priority: AMP_API_TOKEN env var → unauthenticated opt-out → generated session token
    const allowUnauthenticated =
      (process.env['AMP_ALLOW_UNAUTHENTICATED'] ?? '').toLowerCase() === 'true';

    let effectiveToken: string | null;

    if (process.env['AMP_API_TOKEN']) {
      effectiveToken = process.env['AMP_API_TOKEN'];
    } else if (allowUnauthenticated) {
      effectiveToken = null;
      console.error(
        '[AMP] WARNING: AMP_ALLOW_UNAUTHENTICATED=true — server accepts unauthenticated requests.',
      );
    } else {
      effectiveToken = randomUUID();
      console.error(
        `[AMP] No AMP_API_TOKEN set. Generated session token: ${effectiveToken}. Set AMP_ALLOW_UNAUTHENTICATED=true to disable auth.`,
      );
    }

    /** Require a matching Bearer token unless auth is explicitly disabled. */
    function isAuthorized(req: IncomingMessage): boolean {
      if (effectiveToken === null) return true; // auth explicitly disabled via opt-out
      const header = req.headers['authorization'] ?? '';
      return header === `Bearer ${effectiveToken}`;
    }

    function setCorsHeaders(res: ServerResponse, origin: string | undefined): void {
      // Echo back the specific allowed origin (never "*")
      const allowedOrigin = origin && isOriginAllowed(origin) ? origin : 'http://localhost';
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    const httpServer = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const url = req.url ?? '/';
          const origin = req.headers['origin'] as string | undefined;

          // ── CORS preflight ───────────────────────────────────────────────
          if (req.method === 'OPTIONS') {
            if (!isOriginAllowed(origin)) {
              res.writeHead(403);
              res.end('Forbidden: origin not allowed');
              return;
            }
            setCorsHeaders(res, origin);
            res.writeHead(204);
            res.end();
            return;
          }

          // ── Origin validation ────────────────────────────────────────────
          if (!isOriginAllowed(origin)) {
            res.writeHead(403);
            res.end('Forbidden: origin not allowed');
            return;
          }

          // ── Token auth (required by default) ──────────────────────────────
          if (!isAuthorized(req)) {
            res.writeHead(401);
            res.end('Unauthorized: invalid or missing Bearer token');
            return;
          }

          // Set CORS headers on every response
          setCorsHeaders(res, origin);

          if (req.method === 'GET' && url === '/sse') {
            // Create a fresh McpServer per connection (SDK limitation: one transport per server)
            const perSessionServer = new McpServer({ name: 'amp-mcp', version: '0.1.0' });
            registerAllTools(perSessionServer);

            const transport = new SSEServerTransport('/messages', res);
            transports.set(transport.sessionId, transport);
            servers.set(transport.sessionId, perSessionServer);

            transport.onclose = () => {
              transports.delete(transport.sessionId);
              servers.delete(transport.sessionId);
            };

            await perSessionServer.connect(transport);
            return;
          }

          if (req.method === 'POST' && url.startsWith('/messages')) {
            // Route POST message to the correct session
            const sessionId = new URL(url, 'http://localhost').searchParams.get('sessionId');
            const transport = sessionId ? transports.get(sessionId) : undefined;

            if (!transport) {
              res.writeHead(404);
              res.end('Session not found');
              return;
            }

            await transport.handlePostMessage(req, res);
            return;
          }

          res.writeHead(404);
          res.end('Not found');
        } catch (err) {
          console.error('[amp-mcp] Unhandled error in HTTP handler:', err);
          if (!res.headersSent) {
            res.writeHead(500);
            res.end('Internal Server Error');
          }
        }
      },
    );

    await new Promise<void>((resolve, reject) => {
      httpServer.listen(port, () => resolve());
      httpServer.once('error', reject);
    });

    console.error(`[amp-mcp] SSE server listening on http://localhost:${port}/sse`);

    return { httpServer, transports, servers };
  }

  // ─── Stdio transport ──────────────────────────────────────────────────────

  async function startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[amp-mcp] stdio transport connected');
  }

  return {
    server,
    toolNames: [...TOOL_NAMES, ...RESEARCH_TOOL_NAMES, ...ARCH_TOOL_NAMES, ...CODE_TOOL_NAMES, ...RETRIEVAL_TOOL_NAMES, ...WIKI_TOOL_NAMES],
    startSSE,
    startStdio,
  };
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────

// When run directly via `tsx src/server.ts` or `node dist/server.js`
const isMain =
  // ESM: import.meta.url === process.argv[1] resolved URL
  (typeof process !== 'undefined' &&
    process.argv[1] != null &&
    // Works both for tsx (ts path) and compiled js (dist path)
    (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js')));

if (isMain) {
  const useStdio = process.argv.includes('--stdio');

  // Bootstrap: connect Redis + Neo4j, create services, inject into tools
  import('./bootstrap.js')
    .then(({ bootstrap }) => bootstrap())
    .then(async (handles) => {
      const amp = createAMPServer();

      let sseHandle: SSEHandle | undefined;
      if (useStdio) {
        await amp.startStdio();
      } else {
        const port = parseInt(process.env['PORT'] ?? process.env['MCP_PORT'] ?? '3101', 10);
        sseHandle = await amp.startSSE(port);
      }

      // ── Graceful shutdown ───────────────────────────────────────────────
      let shuttingDown = false;

      async function gracefulShutdown(signal: string): Promise<void> {
        if (shuttingDown) return;
        shuttingDown = true;
        console.error(`[amp-mcp] ${signal} received — shutting down gracefully`);

        // 1. Stop accepting new HTTP connections
        if (sseHandle) {
          await new Promise<void>((resolve) => {
            sseHandle!.httpServer.close(() => resolve());
          });

          // 2. Close active SSE transports
          for (const transport of sseHandle.transports.values()) {
            try { await transport.close(); } catch { /* best-effort */ }
          }
          sseHandle.transports.clear();
          sseHandle.servers.clear();
        }

        // 3. Disconnect Redis and Neo4j
        await handles.shutdown();

        console.error('[amp-mcp] Shutdown complete');
        process.exit(0);
      }

      process.on('SIGTERM', () => {
        gracefulShutdown('SIGTERM').catch((err: unknown) => {
          console.error('[amp-mcp] Error during SIGTERM shutdown:', err);
          process.exit(1);
        });
      });
      process.on('SIGINT', () => {
        gracefulShutdown('SIGINT').catch((err: unknown) => {
          console.error('[amp-mcp] Error during SIGINT shutdown:', err);
          process.exit(1);
        });
      });
    })
    .catch((err: unknown) => {
      console.error('[amp-mcp] Fatal startup error:', err);
      process.exit(1);
    });
}
