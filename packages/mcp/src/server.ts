// packages/mcp/src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { registerTools, TOOL_NAMES } from './tools.js';
import { registerResearchTools, RESEARCH_TOOL_NAMES } from '@amp/research';
import { registerArchTools, ARCH_TOOL_NAMES } from '@amp/arch';
import { registerCodeTools, CODE_TOOL_NAMES } from '@amp/code';
import { registerRetrievalTools, RETRIEVAL_TOOL_NAMES } from '@amp/retrieval';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AMPMCPServer {
  /** The underlying McpServer instance. */
  server: McpServer;
  /** Names of all registered tools. */
  toolNames: readonly string[];
  /** Start listening via SSE (HTTP) on the given port. */
  startSSE(port?: number): Promise<void>;
  /** Start listening via stdio. */
  startStdio(): Promise<void>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAMPServer(): AMPMCPServer {
  const server = new McpServer({ name: 'amp-mcp', version: '0.1.0' });

  // Register all AMP tools (core + research + arch + code + retrieval)
  registerTools(server);
  registerResearchTools(server);
  registerArchTools(server);
  registerCodeTools(server);
  registerRetrievalTools(server);

  // ─── SSE transport ────────────────────────────────────────────────────────

  async function startSSE(port = 3101): Promise<void> {
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
      } catch {
        return false;
      }
    }

    const API_TOKEN = process.env['AMP_API_TOKEN'] ?? '';

    /** If AMP_API_TOKEN is set, require a matching Bearer token. */
    function isAuthorized(req: IncomingMessage): boolean {
      if (!API_TOKEN) return true; // token auth disabled
      const header = req.headers['authorization'] ?? '';
      return header === `Bearer ${API_TOKEN}`;
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

        // ── Token auth (when AMP_API_TOKEN is set) ───────────────────────
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
          registerTools(perSessionServer);
          registerResearchTools(perSessionServer);
          registerArchTools(perSessionServer);
          registerCodeTools(perSessionServer);
          registerRetrievalTools(perSessionServer);

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
      },
    );

    await new Promise<void>((resolve, reject) => {
      httpServer.listen(port, () => resolve());
      httpServer.once('error', reject);
    });

    console.error(`[amp-mcp] SSE server listening on http://localhost:${port}/sse`);
  }

  // ─── Stdio transport ──────────────────────────────────────────────────────

  async function startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[amp-mcp] stdio transport connected');
  }

  return {
    server,
    toolNames: [...TOOL_NAMES, ...RESEARCH_TOOL_NAMES, ...ARCH_TOOL_NAMES, ...CODE_TOOL_NAMES, ...RETRIEVAL_TOOL_NAMES],
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
    .then(() => {
      const amp = createAMPServer();

      if (useStdio) {
        return amp.startStdio();
      } else {
        const port = parseInt(process.env['PORT'] ?? process.env['MCP_PORT'] ?? '3101', 10);
        return amp.startSSE(port);
      }
    })
    .catch((err: unknown) => {
      console.error('[amp-mcp] Fatal startup error:', err);
      process.exit(1);
    });
}
