// packages/arch/src/__tests__/aspect-store.regression.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AspectStore } from '../aspect-store.js';

describe('AspectStore regression', () => {
  it('BUG-0028: create returns actual graph node ID on MERGE match, not phantom local ID', async () => {
    // Before the fix, create() returned the locally-generated `id` even when
    // MERGE matched an existing aspect. The existing node's actual ID was never
    // returned, so callers cached a phantom ID that didn't match any graph node.
    // The fix adds RETURN a.id AS nodeId and returns the result from Neo4j.

    const EXISTING_NODE_ID = 'aspect-existing-abc';

    const mockSession = {
      run: vi.fn().mockResolvedValue({
        records: [{
          get: (key: string) => {
            if (key === 'nodeId') return EXISTING_NODE_ID;
            return null;
          },
        }],
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
    };

    const store = new AspectStore(mockDriver as never);
    const returnedId = await store.create({
      name: 'existing-aspect',
      description: 'test',
      stability_tier: 'architectural',
    });

    // Must return the actual graph node ID, not a freshly generated one
    expect(returnedId).toBe(EXISTING_NODE_ID);
  });
});
