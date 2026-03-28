// Regression test for BUG-0008: missing review() and apply() methods on ConsolidationEngine
import { describe, it, expect, vi } from 'vitest';
import { ConsolidationEngine } from '../consolidation.js';
import type { ConsolidationRedisLayer, ConsolidationNeo4jLayer } from '../consolidation.js';
import type { AMPConfig, ConsolidationProposal } from '../types.js';

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

function makeRedis(overrides: Partial<ConsolidationRedisLayer> = {}): ConsolidationRedisLayer {
  return {
    lock: { acquire: vi.fn().mockResolvedValue(true), release: vi.fn().mockResolvedValue(true) },
    signals: { consume: vi.fn().mockResolvedValue([]) },
    queue: { popHighest: vi.fn().mockResolvedValue(null) },
    proposals: {
      save: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      listPending: vi.fn().mockResolvedValue([]),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    cache: { invalidateByNodeId: vi.fn().mockResolvedValue(1) },
    ...overrides,
  };
}

function makeNeo4j(overrides: Partial<ConsolidationNeo4jLayer> = {}): ConsolidationNeo4jLayer {
  return {
    semantic: {
      getById: vi.fn().mockResolvedValue(null),
      updateConfidence: vi.fn().mockResolvedValue(undefined),
      supersede: vi.fn().mockResolvedValue('new-id'),
    },
    ...overrides,
  };
}

describe('BUG-0008: review() and apply() methods must exist', () => {
  it('BUG-0008: review() returns proposal data for a valid proposal ID', async () => {
    const proposal: ConsolidationProposal = {
      id: 'prop-review',
      type: 'decay',
      scope: 'test',
      affected_ids: ['sem-1'],
      before: { confidence: 0.8 },
      after: { confidence: 0.6 },
      score: 5,
      created_at: new Date().toISOString(),
    };

    const redis = makeRedis({
      proposals: {
        save: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(proposal),
        listPending: vi.fn().mockResolvedValue(['prop-review']),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    });
    const neo4j = makeNeo4j();

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());

    // The bug was: review() did not exist, calling it would throw "is not a function"
    expect(typeof engine.review).toBe('function');

    const result = await engine.review('prop-review');
    expect(result).toBeDefined();
    expect((result as Record<string, unknown>).id).toBe('prop-review');
  });

  it('BUG-0008: apply() executes approve/reject and returns result', async () => {
    const proposal: ConsolidationProposal = {
      id: 'prop-apply',
      type: 'decay',
      scope: 'test',
      affected_ids: ['sem-apply'],
      before: { confidence: 0.8 },
      after: { confidence: 0.6 },
      score: 5,
      created_at: new Date().toISOString(),
    };

    const redis = makeRedis({
      proposals: {
        save: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(proposal),
        listPending: vi.fn().mockResolvedValue(['prop-apply']),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    });
    const neo4j = makeNeo4j();

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());

    // The bug was: apply() did not exist, calling it would throw "is not a function"
    expect(typeof engine.apply).toBe('function');

    const result = await engine.apply('prop-apply', 'reject');
    expect(result).toEqual({ applied: false });
    expect(redis.proposals.remove).toHaveBeenCalledWith('prop-apply');
  });
});
