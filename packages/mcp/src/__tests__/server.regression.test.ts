// packages/mcp/src/__tests__/server.regression.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SERVER_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../server.ts'),
  'utf-8',
);

describe('server.ts regression', () => {
  it('BUG-0005: HTTP handler body is wrapped in try/catch with 500 response', () => {
    // Before the fix, the async HTTP handler had no try/catch, so any thrown error
    // became an unhandled promise rejection that crashed the MCP server process.
    // The fix wraps the entire handler body in try/catch, logging the error and
    // returning HTTP 500 when headers haven't been sent yet.

    // Verify the catch block exists with the expected error handling pattern
    expect(SERVER_SOURCE).toContain('catch (err)');
    expect(SERVER_SOURCE).toContain('Unhandled error in HTTP handler');
    expect(SERVER_SOURCE).toContain('res.headersSent');
    expect(SERVER_SOURCE).toContain('res.writeHead(500)');
  });

  it('BUG-0008: SIGTERM and SIGINT handlers have .catch() on gracefulShutdown', () => {
    // Before the fix, signal handlers called gracefulShutdown() without .catch(),
    // so if shutdown threw, process.exit was never called.

    const sigtermMatch = SERVER_SOURCE.match(
      /process\.on\(\s*'SIGTERM'[\s\S]*?gracefulShutdown[\s\S]*?\.catch/,
    );
    const sigintMatch = SERVER_SOURCE.match(
      /process\.on\(\s*'SIGINT'[\s\S]*?gracefulShutdown[\s\S]*?\.catch/,
    );

    expect(sigtermMatch).not.toBeNull();
    expect(sigintMatch).not.toBeNull();
  });
});
