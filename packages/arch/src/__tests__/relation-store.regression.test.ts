// packages/arch/src/__tests__/relation-store.regression.test.ts
import { describe, it, expect, vi } from 'vitest';
import { StructuralRelationStore } from '../relation-store.js';

describe('StructuralRelationStore regression', () => {
  it('BUG-0046: getCallGraph rejects non-integer maxDepth to prevent Cypher injection', async () => {
    // Before the fix, maxDepth was interpolated directly into a Cypher path
    // pattern (`*1..${maxDepth}`) with no validation. A non-integer value
    // like "3] DETACH DELETE n //" could inject arbitrary Cypher.
    // The fix validates maxDepth is a finite integer between 1 and 20.

    const mockDriver = {
      session: vi.fn(),
    };

    const store = new StructuralRelationStore(mockDriver as never);

    // String injection attempt
    await expect(store.getCallGraph('test', '3] DETACH DELETE n //' as never)).rejects.toThrow(
      /maxDepth must be an integer between 1 and 20/,
    );

    // NaN
    await expect(store.getCallGraph('test', NaN as never)).rejects.toThrow(
      /maxDepth must be an integer between 1 and 20/,
    );

    // Out of bounds
    await expect(store.getCallGraph('test', 100 as never)).rejects.toThrow(
      /maxDepth must be an integer between 1 and 20/,
    );

    // Negative
    await expect(store.getCallGraph('test', -1 as never)).rejects.toThrow(
      /maxDepth must be an integer between 1 and 20/,
    );

    // session() should never have been called — validation happens before DB access
    expect(mockDriver.session).not.toHaveBeenCalled();
  });
});
