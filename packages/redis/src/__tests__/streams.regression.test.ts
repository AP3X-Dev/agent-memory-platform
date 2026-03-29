// packages/redis/src/__tests__/streams.regression.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EpisodicBuffer } from '../streams.js';

describe('EpisodicBuffer regression', () => {
  it('BUG-0019: flush deletes only specific fetched message IDs, not a range', async () => {
    // Before the fix, flush did XRANGE then XDEL in a non-atomic way that could
    // delete entries added between the read and delete (concurrent add data loss)
    // or re-deliver already-deleted messages (concurrent flush duplication).
    // The fix ensures XDEL targets only the exact message IDs from XRANGE.

    const mockRedis = {
      xrange: vi.fn().mockResolvedValue([
        ['1-0', ['session_id', 'sess-A', 'event_type', 'store', 'content', 'data1']],
        ['2-0', ['session_id', 'sess-B', 'event_type', 'store', 'content', 'data2']],
        ['3-0', ['session_id', 'sess-A', 'event_type', 'load', 'content', 'data3']],
      ]),
      xdel: vi.fn().mockResolvedValue(2),
    };

    const buffer = new EpisodicBuffer(mockRedis as never);
    const events = await buffer.flush('sess-A');

    // Should return only sess-A events
    expect(events).toHaveLength(2);
    expect(events[0].content).toBe('data1');
    expect(events[1].content).toBe('data3');

    // XDEL must be called with specific IDs only — not sess-B's message
    expect(mockRedis.xdel).toHaveBeenCalledOnce();
    const xdelArgs = mockRedis.xdel.mock.calls[0];
    expect(xdelArgs).toContain('1-0');
    expect(xdelArgs).toContain('3-0');
    expect(xdelArgs).not.toContain('2-0');
  });

  it('BUG-0019: flush skips XDEL when no matching entries found', async () => {
    const mockRedis = {
      xrange: vi.fn().mockResolvedValue([
        ['1-0', ['session_id', 'sess-B', 'event_type', 'store', 'content', 'data']],
      ]),
      xdel: vi.fn(),
    };

    const buffer = new EpisodicBuffer(mockRedis as never);
    const events = await buffer.flush('sess-A');

    expect(events).toHaveLength(0);
    // XDEL should NOT be called when there are no matching entries
    expect(mockRedis.xdel).not.toHaveBeenCalled();
  });
});
