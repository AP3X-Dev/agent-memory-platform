// packages/core/src/__tests__/consolidation.regression.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ConsolidationEngine } from '../consolidation.js';
import type { ConsolidationRedisLayer, ConsolidationNeo4jLayer } from '../consolidation.js';
import type { AMPConfig, SemanticNode, ConsolidationProposal } from '../types.js';

function makeConfig(): AMPConfig {
  return {
    redis: { url: 'redis://localhost:6379' },
    neo4j: { uri: 'bolt://localhost:7687', user: 'neo4j', password: 'password' },
    embedding: { provider: 'openai', apiKey: 'test-key' },
    cache: { defaultTTL: 300, contextTTL: 600, embeddingTTL: 86400 },
    consolidation: { autoApply: true, signalThreshold: 1 },
    exportPath: '/tmp/amp-export',
  };
}

function makeSemanticNode(id = 'sem-1'): SemanticNode {
  return {
    id, content: 'test', confidence: 0.8, signal_count: 2,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    decay_class: 'stable', tags: ['test'],
  };
}

function makeRedis(overrides: Partial<ConsolidationRedisLayer> = {}): ConsolidationRedisLayer {
  return {
    lock: { acquire: vi.fn().mockResolvedValue(true), release: vi.fn().mockResolvedValue(true) },
    signals: { consume: vi.fn().mockResolvedValue([{
      type: 'reinforcement', target_id: 'sem-1', detail: 'good',
      source_session: 's1', agent_id: 'a1', timestamp: new Date().toISOString(),
    }]) },
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
      getById: vi.fn().mockResolvedValue(makeSemanticNode()),
      updateConfidence: vi.fn().mockRejectedValue(new Error('Neo4j connection lost')),
      supersede: vi.fn().mockResolvedValue('new-id'),
    },
    ...overrides,
  };
}

describe('ConsolidationEngine regression', () => {
  it('BUG-0010: _applyProposal logs to console.error when Neo4j write fails during autoApply', async () => {
    // Before the fix, the catch block silently returned false with no logging.
    // Operators could not distinguish infrastructure errors from rejections.
    // The fix adds console.error with proposal ID and type.

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());

    const result = await engine.run('test-scope');

    // The autoApply path calls _applyProposal which should catch the Neo4j error
    // and log it rather than silently swallowing
    const errorCalls = consoleSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('_applyProposal failed'),
    );
    expect(errorCalls.length).toBeGreaterThan(0);

    // The result should show proposals were generated but not applied
    expect(result.applied).toHaveLength(0);

    consoleSpy.mockRestore();
  });
});
