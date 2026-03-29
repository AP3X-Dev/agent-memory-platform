// packages/core/src/__tests__/service.regression.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AMPService } from '../service.js';
import type { RedisLayer, Neo4jLayer } from '../service.js';
import type { AMPConfig } from '../types.js';

function makeConfig(): AMPConfig {
  return {
    redis: { url: 'redis://localhost:6379' },
    neo4j: { uri: 'bolt://localhost:7687', user: 'neo4j', password: 'password' },
    embedding: { provider: 'openai', apiKey: 'test-key' },
    cache: { defaultTTL: 300, contextTTL: 600, embeddingTTL: 86400 },
    consolidation: { autoApply: false, signalThreshold: 3 },
    exportPath: '/tmp/amp-export',
  };
}

function makeRedis(overrides: Partial<RedisLayer> = {}): RedisLayer {
  return {
    cache: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      invalidateByNodeId: vi.fn().mockResolvedValue(1),
    },
    embeddings: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
    dedup: {
      isDuplicate: vi.fn().mockResolvedValue(false),
      markSeen: vi.fn().mockResolvedValue(undefined),
      checkAndMark: vi.fn().mockResolvedValue(false),
    },
    signals: {
      publish: vi.fn().mockResolvedValue('stream-id-1'),
    },
    queue: {
      incrementScore: vi.fn().mockResolvedValue(1),
    },
    ...overrides,
  };
}

function makeNeo4j(): Neo4jLayer {
  return {
    episodic: {
      create: vi.fn().mockResolvedValue('ep-1'),
      linkToAgent: vi.fn().mockResolvedValue(undefined),
      linkToEntity: vi.fn().mockResolvedValue(undefined),
      linkToModel: vi.fn().mockResolvedValue(undefined),
      linkSignal: vi.fn().mockResolvedValue(undefined),
    },
    query: {
      byScope: vi.fn().mockResolvedValue([]),
    },
  } as unknown as Neo4jLayer;
}

describe('AMPService.store regression', () => {
  it('BUG-0020: uses atomic checkAndMark instead of separate isDuplicate+markSeen to prevent TOCTOU race', async () => {
    // Before the fix, store() called isDuplicate() then markSeen() as two
    // separate Redis operations. Two concurrent store() calls with the same
    // content could both pass isDuplicate() before either called markSeen(),
    // creating duplicate Episodic nodes.
    // The fix replaces these with a single atomic checkAndMark (SET NX).

    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const embedding = { embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]) };

    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    await service.store({
      session_id: 'sess-1',
      agent_id: 'agent-1',
      task: 'test task',
      content: 'test content',
    });

    // checkAndMark must be called (atomic dedup)
    expect(redis.dedup.checkAndMark).toHaveBeenCalledTimes(1);

    // The old non-atomic methods should NOT be called by store()
    expect(redis.dedup.isDuplicate).not.toHaveBeenCalled();
    expect(redis.dedup.markSeen).not.toHaveBeenCalled();
  });
});
