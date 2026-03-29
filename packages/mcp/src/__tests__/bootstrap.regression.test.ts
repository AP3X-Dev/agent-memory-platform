// packages/mcp/src/__tests__/bootstrap.regression.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const BOOTSTRAP_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../bootstrap.ts'),
  'utf-8',
);

describe('bootstrap.ts regression', () => {
  it('BUG-0007: apply adapter wraps reviewProposal in try/catch and returns failure on error', () => {
    // Before the fix, the apply adapter always returned { applied: true }
    // even when reviewProposal threw. The fix wraps it in try/catch
    // and returns { applied: false, error } on failure.

    // Verify the apply adapter contains a try/catch pattern
    const applyBlock = BOOTSTRAP_SOURCE.match(
      /apply:\s*async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s{4}\},/,
    );
    expect(applyBlock).not.toBeNull();

    const applyBody = applyBlock![1];

    // Must contain try/catch
    expect(applyBody).toContain('try');
    expect(applyBody).toContain('catch');

    // Must return applied: false on error path
    expect(applyBody).toContain('applied: false');
  });
});
