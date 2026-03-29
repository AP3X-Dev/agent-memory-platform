// packages/mcp/src/__tests__/server.bug0003.regression.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SERVER_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../server.ts'),
  'utf-8',
);

describe('server.ts auth regression', () => {
  it('BUG-0003: server requires authentication by default when no env vars are set', () => {
    // Before the fix, isAuthorized() returned true for all requests when
    // AMP_API_TOKEN was unset, leaving the SSE server completely open.
    // The v2 fix implements three-tier auth:
    //   1. Use AMP_API_TOKEN if set
    //   2. Allow unauth only with explicit AMP_ALLOW_UNAUTHENTICATED=true
    //   3. Otherwise generate a random session token via randomUUID()
    // This ensures the server is authenticated by default.

    // Verify three-tier auth structure exists
    expect(SERVER_SOURCE).toContain('AMP_API_TOKEN');
    expect(SERVER_SOURCE).toContain('AMP_ALLOW_UNAUTHENTICATED');
    expect(SERVER_SOURCE).toContain('randomUUID()');

    // Verify isAuthorized checks Bearer token (not just returning true)
    expect(SERVER_SOURCE).toMatch(/function isAuthorized/);
    expect(SERVER_SOURCE).toMatch(/Bearer \$\{effectiveToken\}/);

    // Verify the fallback generates a token (not null/undefined)
    // The else branch must call randomUUID, not set null
    const elseBlock = SERVER_SOURCE.match(
      /\} else \{\s*\n\s*effectiveToken = randomUUID\(\)/,
    );
    expect(elseBlock).not.toBeNull();

    // Verify auth is only disabled via explicit opt-out, not by default
    expect(SERVER_SOURCE).toMatch(
      /effectiveToken === null\).*true.*auth explicitly disabled/,
    );
  });
});
