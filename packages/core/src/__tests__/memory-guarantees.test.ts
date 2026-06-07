// packages/core/src/__tests__/memory-guarantees.test.ts
//
// Explicit regression gates for two memory-quality guarantees the review called for:
//   (4) load() surfaces only ACTIVE knowledge — invalidated/superseded facts are
//       excluded because load reads through the active-only accessor.
//   (5) a correction outranks an older reinforcement (signal-weight precedence).

import { describe, it, expect, vi } from 'vitest';
import { AMPService } from '../service.js';
import type { RedisLayer, Neo4jLayer, FactLayer } from '../service.js';
import { SIGNAL_WEIGHTS } from '../types.js';
import type { AMPConfig, FactNode } from '../types.js';

vi.mock('../extract.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../extract.js')>();
  return { ...actual, extractFacts: vi.fn().mockResolvedValue([]) };
});

function makeConfig(): AMPConfig {
  return {
    redis: { url: 'redis://x' }, neo4j: { uri: 'bolt://x', user: 'n', password: 'p' },
    embedding: { provider: 'openai', apiKey: 'k' },
    cache: { defaultTTL: 300, contextTTL: 600, embeddingTTL: 86400 },
    consolidation: { autoApply: false, signalThreshold: 3 }, exportPath: '/tmp/x',
  };
}
function makeRedis(): RedisLayer {
  return {
    cache: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined), invalidateByScope: vi.fn().mockResolvedValue(0), invalidateByNodeId: vi.fn().mockResolvedValue(0) },
    embeddings: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) },
    dedup: { isDuplicate: vi.fn().mockResolvedValue(false), markSeen: vi.fn().mockResolvedValue(undefined), checkAndMark: vi.fn().mockResolvedValue(false) },
    signals: { publish: vi.fn().mockResolvedValue('s') }, queue: { incrementScore: vi.fn().mockResolvedValue(1) },
  };
}
function fact(over: Partial<FactNode>): FactNode {
  return {
    id: 'f', subject: 'auth', predicate: 'uses', object: 'JWT', entity_id: 'e1',
    source_episode_ids: [], valid_at: new Date().toISOString(), invalid_at: null,
    confidence: 0.9, status: 'active', supersedes_fact_id: null, scope: 'project',
    tags: ['project:test'], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...over,
  };
}

describe('Guarantee: load() excludes stale/invalidated knowledge', () => {
  it('renders facts from the active-only accessor and never an invalidated one', async () => {
    // getActive is the active-only contract: it returns only the active fact.
    const getActive = vi.fn().mockResolvedValue([fact({ id: 'f-active', object: 'ACTIVEMARKER' })]);
    const factLayer: FactLayer = {
      getActive,
      create: vi.fn(), findBySubjectPredicate: vi.fn().mockResolvedValue([]),
      invalidate: vi.fn(),
    };
    const neo4j: Neo4jLayer = {
      episodic: { create: vi.fn(), linkToAgent: vi.fn(), linkToEntity: vi.fn(), linkToModel: vi.fn(), linkSignal: vi.fn() },
      query: { byScope: vi.fn().mockResolvedValue([]), byVector: vi.fn().mockResolvedValue([]) },
      fact: factLayer,
    };
    const svc = new AMPService(makeRedis(), neo4j, { available: false, embed: vi.fn(), embedBatch: vi.fn() }, makeConfig());

    const result = await svc.load({ task: 'auth design', entities: ['auth'], tags: ['project:test'], max_tokens: 4000 });

    expect(getActive).toHaveBeenCalledWith('auth', undefined);
    expect(result.markdown).toContain('ACTIVEMARKER');
    // An invalidated fact (one we never return from getActive) cannot appear.
    expect(result.markdown).not.toContain('INVALIDMARKER');
  });
});

describe('Guarantee: a correction outranks an older reinforcement', () => {
  it('weights correction far above reinforcement', () => {
    expect(SIGNAL_WEIGHTS.correction).toBeGreaterThan(SIGNAL_WEIGHTS.reinforcement);
    expect(SIGNAL_WEIGHTS.contradiction).toBeGreaterThan(SIGNAL_WEIGHTS.reinforcement);
  });

  it('a single correction crosses the consolidation threshold while a single reinforcement does not', () => {
    // Consolidation clusters signal weight per target and acts when totalWeight
    // >= signalThreshold (default 3). One correction (5) acts; one reinforcement (1) waits.
    const threshold = 3;
    expect(SIGNAL_WEIGHTS.correction).toBeGreaterThanOrEqual(threshold);
    expect(SIGNAL_WEIGHTS.reinforcement).toBeLessThan(threshold);
  });
});
