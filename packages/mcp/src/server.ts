// packages/mcp/src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { registerTools, TOOL_NAMES } from './tools.js';

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

  // Register all four AMP tools
  registerTools(server);

  // ─── SSE transport ────────────────────────────────────────────────────────

  async function startSSE(port = 3101): Promise<void> {
    const transports = new Map<string, SSEServerTransport>();

    const httpServer = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        const url = req.url ?? '/';

        if (req.method === 'GET' && url === '/sse') {
          // Establish SSE stream
          const transport = new SSEServerTransport('/messages', res);
          transports.set(transport.sessionId, transport);

          transport.onclose = () => {
            transports.delete(transport.sessionId);
          };

          await server.connect(transport);
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
    toolNames: TOOL_NAMES,
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
  const amp = createAMPServer();

  if (useStdio) {
    amp.startStdio().catch((err: unknown) => {
      console.error('[amp-mcp] stdio error:', err);
      process.exit(1);
    });
  } else {
    const port = parseInt(process.env['PORT'] ?? '3101', 10);
    amp.startSSE(port).catch((err: unknown) => {
      console.error('[amp-mcp] SSE error:', err);
      process.exit(1);
    });
  }
}
