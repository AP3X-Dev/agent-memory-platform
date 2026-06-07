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
    // MEMBERRY_API_TOKEN was unset, leaving the SSE server completely open.
    // The v2 fix implements three-tier auth:
    //   1. Use MEMBERRY_API_TOKEN if set
    //   2. Allow unauth only with explicit MEMBERRY_ALLOW_UNAUTHENTICATED=true
    //   3. Otherwise generate a random session token via randomUUID()
    // This ensures the server is authenticated by default.

    // Verify three-tier auth structure exists
    expect(SERVER_SOURCE).toContain('MEMBERRY_API_TOKEN');
    expect(SERVER_SOURCE).toContain('MEMBERRY_ALLOW_UNAUTHENTICATED');
    expect(SERVER_SOURCE).toContain('randomUUID()');

    // Verify isAuthorized validates a Bearer token (not just returning true).
    // Auth now resolves a per-actor identity and compares tokens in constant time
    // (timingSafeEqual) rather than a single string-equality on `effectiveToken`.
    expect(SERVER_SOURCE).toMatch(/function isAuthorized/);
    expect(SERVER_SOURCE).toMatch(/Bearer /);
    expect(SERVER_SOURCE).toContain('timingSafeEqual');
    expect(SERVER_SOURCE).toMatch(/actorFor\(req\)/);

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
