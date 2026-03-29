// packages/arch/src/__tests__/entity-store.regression.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ArchEntityStore } from '../entity-store.js';

describe('ArchEntityStore regression', () => {
  it('BUG-0030: setArchProperties rejects property keys with Cypher injection characters', async () => {
    // Before the fix, Object.entries(props) keys were interpolated directly into
    // Cypher (`e.${key} = $${key}`) without validation. A crafted key like
    // "} DETACH DELETE n //" could inject arbitrary Cypher.
    // The fix adds SAFE_PROPERTY_KEY regex validation.

    const mockSession = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
    };

    const store = new ArchEntityStore(mockDriver as never);

    // Injection attempt via property key
    await expect(
      store.setArchProperties('test-entity', {
        '} DETACH DELETE n //': 'malicious',
      } as never),
    ).rejects.toThrow('Invalid property key');

    // Neo4j session.run should never have been called
    expect(mockSession.run).not.toHaveBeenCalled();
  });
});
