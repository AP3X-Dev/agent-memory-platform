// packages/core/src/__tests__/consolidation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsolidationEngine } from '../consolidation.js';
import type { ConsolidationRedisLayer, ConsolidationNeo4jLayer } from '../consolidation.js';
import type { AMPConfig, SemanticNode, StreamSignal, ConsolidationProposal } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(autoApply = false): AMPConfig {
  return {
    redis: { url: 'redis://localhost:6379' },
    neo4j: { uri: 'bolt://localhost:7687', user: 'neo4j', password: 'password' },
    embedding: { provider: 'openai', apiKey: 'test-key' },
    cache: { defaultTTL: 300, contextTTL: 600, embeddingTTL: 86400 },
    consolidation: { autoApply, signalThreshold: 3 },
    exportPath: '/tmp/amp-export',
  };
}

function makeSemanticNode(id = 'sem-1'): SemanticNode {
  return {
    id,
    content: 'Semantic knowledge about the task',
    confidence: 0.8,
    signal_count: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    decay_class: 'stable',
    tags: ['test'],
  };
}

function makeStreamSignal(targetId: string, type: StreamSignal['type'] = 'reinforcement'): StreamSignal {
  return {
    type,
    target_id: targetId,
    detail: 'Test signal detail',
    source_session: 'sess-1',
    agent_id: 'agent-1',
    timestamp: new Date().toISOString(),
  };
}

// ─── Mock factories ────────────────────────────────────────────────────────────

function makeRedis(overrides: Partial<ConsolidationRedisLayer> = {}): ConsolidationRedisLayer {
  return {
    lock: {
      acquire: vi.fn().mockResolvedValue(true),
      release: vi.fn().mockResolvedValue(true),
    },
    signals: {
      consume: vi.fn().mockResolvedValue([]),
    },
    queue: {
      popHighest: vi.fn().mockResolvedValue(null),
    },
    proposals: {
      save: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      listPending: vi.fn().mockResolvedValue([]),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    cache: {
      invalidateByNodeId: vi.fn().mockResolvedValue(1),
    },
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConsolidationEngine.run', () => {
  it('returns skipped when lock cannot be acquired', async () => {
    const redis = makeRedis({
      lock: {
        acquire: vi.fn().mockResolvedValue(false),
        release: vi.fn().mockResolvedValue(false),
      },
    });
    const neo4j = makeNeo4j();

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());
    const result = await engine.run('test-scope');

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('lock_held');
    expect(result.proposals).toHaveLength(0);
    expect(result.applied).toHaveLength(0);
    // lock was never released (since it wasn't acquired)
    expect(redis.lock.release).not.toHaveBeenCalled();
  });

  it('releases lock even when an error occurs', async () => {
    const redis = makeRedis({
      signals: {
        consume: vi.fn().mockRejectedValue(new Error('stream error')),
      },
    });
    const neo4j = makeNeo4j();

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());

    await expect(engine.run('test-scope')).rejects.toThrow('stream error');
    expect(redis.lock.release).toHaveBeenCalledOnce();
  });

  it('generates proposals from signals when threshold is met', async () => {
    const node = makeSemanticNode('sem-target');

    // 4 correction signals → totalWeight = 4 * 5.0 = 20 (above threshold 3)
    const signals: StreamSignal[] = [
      makeStreamSignal('sem-target', 'correction'),
      makeStreamSignal('sem-target', 'correction'),
      makeStreamSignal('sem-target', 'correction'),
      makeStreamSignal('sem-target', 'correction'),
    ];

    const redis = makeRedis({
      signals: {
        consume: vi.fn().mockResolvedValue(signals),
      },
    });
    const neo4j = makeNeo4j({
      semantic: {
        getById: vi.fn().mockResolvedValue(node),
        updateConfidence: vi.fn().mockResolvedValue(undefined),
        supersede: vi.fn().mockResolvedValue('new-sem-id'),
      },
    });

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig(false));
    const result = await engine.run('test-scope');

    expect(result.skipped).toBe(false);
    expect(result.proposals.length).toBeGreaterThan(0);
    expect(result.proposals[0].affected_ids).toContain('sem-target');
    // Not auto-applied → saved to proposals store
    expect(redis.proposals.save).toHaveBeenCalledTimes(result.proposals.length);
    expect(result.applied).toHaveLength(0);
  });

  it('RAISES confidence on reinforcement signals (not decay)', async () => {
    // Reinforcement is evidence the knowledge held true — confidence must go UP, never
    // down. (Regression: this branch previously called buildDecayProposal, lowering
    // confidence by 5% on every confirmation.)
    const node = makeSemanticNode('sem-reinforced'); // confidence 0.8
    const signals: StreamSignal[] = [
      makeStreamSignal('sem-reinforced', 'reinforcement'),
      makeStreamSignal('sem-reinforced', 'reinforcement'),
      makeStreamSignal('sem-reinforced', 'reinforcement'),
      makeStreamSignal('sem-reinforced', 'reinforcement'),
    ];

    const redis = makeRedis({
      signals: { consume: vi.fn().mockResolvedValue(signals) },
    });
    const neo4j = makeNeo4j({
      semantic: {
        getById: vi.fn().mockResolvedValue(node),
        updateConfidence: vi.fn().mockResolvedValue(undefined),
        supersede: vi.fn().mockResolvedValue('new-id'),
      },
    });

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig(false));
    const result = await engine.run('reinforce-scope');

    const proposal = result.proposals.find((p) => p.affected_ids.includes('sem-reinforced'));
    expect(proposal).toBeDefined();
    expect(proposal?.type).toBe('reinforce');
    const afterConfidence = (proposal?.after as { confidence?: number }).confidence;
    expect(afterConfidence).toBeGreaterThan(node.confidence); // raised, not decayed
    expect(afterConfidence).toBeLessThanOrEqual(1); // bounded
  });

  it('auto-applies proposals when autoApply is true', async () => {
    const node = makeSemanticNode('sem-auto');

    const signals: StreamSignal[] = [
      makeStreamSignal('sem-auto', 'correction'),
      makeStreamSignal('sem-auto', 'correction'),
      makeStreamSignal('sem-auto', 'correction'),
    ];

    const redis = makeRedis({
      signals: {
        consume: vi.fn().mockResolvedValue(signals),
      },
    });
    const neo4j = makeNeo4j({
      semantic: {
        getById: vi.fn().mockResolvedValue(node),
        updateConfidence: vi.fn().mockResolvedValue(undefined),
        supersede: vi.fn().mockResolvedValue('new-sem-auto'),
      },
    });

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig(true));
    const result = await engine.run('auto-scope');

    expect(result.skipped).toBe(false);
    expect(result.proposals.length).toBeGreaterThan(0);
    expect(result.applied.length).toBeGreaterThan(0);
    // save should NOT be called when auto-applying
    expect(redis.proposals.save).not.toHaveBeenCalled();
  });

  it('skips signals below the threshold', async () => {
    // 1 reinforcement signal → weight = 1.0 < threshold 3
    const signals: StreamSignal[] = [
      makeStreamSignal('sem-below', 'reinforcement'),
    ];

    const redis = makeRedis({
      signals: {
        consume: vi.fn().mockResolvedValue(signals),
      },
    });
    const neo4j = makeNeo4j();

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());
    const result = await engine.run('below-threshold-scope');

    expect(result.proposals).toHaveLength(0);
  });

  it('generates decay proposals from queue entries above threshold', async () => {
    const node = makeSemanticNode('sem-queued');

    let callCount = 0;
    const redis = makeRedis({
      queue: {
        popHighest: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve({ member: 'sem-queued', score: 10 });
          return Promise.resolve(null);
        }),
      },
    });
    const neo4j = makeNeo4j({
      semantic: {
        getById: vi.fn().mockResolvedValue(node),
        updateConfidence: vi.fn().mockResolvedValue(undefined),
        supersede: vi.fn().mockResolvedValue('new-id'),
      },
    });

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());
    const result = await engine.run('queue-scope');

    expect(result.proposals.length).toBeGreaterThan(0);
    const decayProposal = result.proposals.find((p) => p.type === 'decay');
    expect(decayProposal).toBeDefined();
    expect(decayProposal?.affected_ids).toContain('sem-queued');
  });
});

describe('ConsolidationEngine.reviewProposal', () => {
  it('throws when proposal not found', async () => {
    const redis = makeRedis({
      proposals: {
        save: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        listPending: vi.fn().mockResolvedValue([]),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    });
    const neo4j = makeNeo4j();

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());

    await expect(engine.reviewProposal('nonexistent-id', 'approve')).rejects.toThrow(
      'Proposal nonexistent-id not found',
    );
  });

  it('removes the proposal on reject', async () => {
    const proposal: ConsolidationProposal = {
      id: 'prop-1',
      type: 'decay',
      scope: 'test',
      affected_ids: ['sem-1'],
      before: {},
      after: { confidence: 0.5 },
      score: 5,
      created_at: new Date().toISOString(),
    };

    const redis = makeRedis({
      proposals: {
        save: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(proposal),
        listPending: vi.fn().mockResolvedValue(['prop-1']),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    });
    const neo4j = makeNeo4j();

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());
    await engine.reviewProposal('prop-1', 'reject');

    expect(redis.proposals.remove).toHaveBeenCalledWith('prop-1');
    // No Neo4j calls on reject
    expect(neo4j.semantic.updateConfidence).not.toHaveBeenCalled();
    expect(neo4j.semantic.supersede).not.toHaveBeenCalled();
  });

  it('applies a decay proposal on approve', async () => {
    const proposal: ConsolidationProposal = {
      id: 'prop-decay',
      type: 'decay',
      scope: 'test',
      affected_ids: ['sem-decay'],
      before: { confidence: 0.8 },
      after: { confidence: 0.76 },
      score: 5,
      created_at: new Date().toISOString(),
    };

    const redis = makeRedis({
      proposals: {
        save: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(proposal),
        listPending: vi.fn().mockResolvedValue(['prop-decay']),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    });
    const neo4j = makeNeo4j();

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());
    await engine.reviewProposal('prop-decay', 'approve');

    expect(neo4j.semantic.updateConfidence).toHaveBeenCalledWith('sem-decay', 0.76);
    expect(redis.cache.invalidateByNodeId).toHaveBeenCalledWith('sem-decay');
    expect(redis.proposals.remove).toHaveBeenCalledWith('prop-decay');
  });

  it('applies a supersede proposal on approve', async () => {
    const node = makeSemanticNode('sem-old');
    const proposal: ConsolidationProposal = {
      id: 'prop-supersede',
      type: 'supersede',
      scope: 'test',
      affected_ids: ['sem-old'],
      before: { ...node } as Record<string, unknown>,
      after: { ...node, confidence: 0.9 } as Record<string, unknown>,
      score: 15,
      created_at: new Date().toISOString(),
    };

    const redis = makeRedis({
      proposals: {
        save: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(proposal),
        listPending: vi.fn().mockResolvedValue(['prop-supersede']),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    });
    const neo4j = makeNeo4j({
      semantic: {
        getById: vi.fn().mockResolvedValue(node),
        updateConfidence: vi.fn().mockResolvedValue(undefined),
        supersede: vi.fn().mockResolvedValue('new-sem-id'),
      },
    });

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());
    await engine.reviewProposal('prop-supersede', 'approve');

    expect(neo4j.semantic.supersede).toHaveBeenCalledWith('sem-old', expect.objectContaining({
      confidence: 0.9,
    }));
    expect(redis.cache.invalidateByNodeId).toHaveBeenCalledWith('sem-old');
    expect(redis.proposals.remove).toHaveBeenCalledWith('prop-supersede');
  });
});

describe('ConsolidationEngine tenant propagation', () => {
  it('carries the tenant forward when superseding a node', async () => {
    const node = { ...makeSemanticNode('sem-tenant'), tenant_id: 'acme' };
    const proposal: ConsolidationProposal = {
      id: 'prop-supersede-tenant',
      type: 'supersede',
      scope: 'test',
      affected_ids: ['sem-tenant'],
      before: { ...node } as Record<string, unknown>,
      after: { ...node, confidence: 0.9 } as Record<string, unknown>,
      score: 15,
      created_at: new Date().toISOString(),
    };

    const supersede = vi.fn().mockResolvedValue('new-sem-id');
    const redis = makeRedis({
      proposals: {
        save: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(proposal),
        listPending: vi.fn().mockResolvedValue(['prop-supersede-tenant']),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    });
    const neo4j = makeNeo4j({
      semantic: {
        getById: vi.fn().mockResolvedValue(node),
        updateConfidence: vi.fn().mockResolvedValue(undefined),
        supersede,
      },
    });

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());
    await engine.reviewProposal('prop-supersede-tenant', 'approve');

    expect(supersede).toHaveBeenCalledWith('sem-tenant', expect.objectContaining({
      tenant_id: 'acme',
    }));
  });

  it('derives a promoted semantic\'s tenant from the common tenant of source episodes', async () => {
    const proposal: ConsolidationProposal = {
      id: 'prop-promote',
      type: 'promote',
      scope: 'test',
      affected_ids: ['ep-1', 'ep-2'],
      before: {},
      after: { content: 'Distilled knowledge', confidence: 0.7 } as Record<string, unknown>,
      score: 10,
      created_at: new Date().toISOString(),
    };

    const promoteFromEpisodic = vi.fn().mockResolvedValue('new-promoted-id');
    const episodicGetById = vi.fn().mockResolvedValue({
      id: 'ep-x',
      session_id: 's',
      agent_id: 'a',
      task: 't',
      content: 'c',
      created_at: new Date().toISOString(),
      tenant_id: 'acme',
    });

    const redis = makeRedis({
      proposals: {
        save: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(proposal),
        listPending: vi.fn().mockResolvedValue(['prop-promote']),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    });
    const neo4j = makeNeo4j({
      semantic: {
        getById: vi.fn().mockResolvedValue(null),
        updateConfidence: vi.fn().mockResolvedValue(undefined),
        supersede: vi.fn().mockResolvedValue('x'),
        promoteFromEpisodic,
      },
      episodic: { getById: episodicGetById },
    });

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());
    await engine.reviewProposal('prop-promote', 'approve');

    expect(promoteFromEpisodic).toHaveBeenCalledWith(
      'ep-1',
      expect.objectContaining({ tenant_id: 'acme', content: 'Distilled knowledge' }),
      'acme',
    );
  });

  it('falls back to DEFAULT_TENANT for a promote when source episodes mix tenants', async () => {
    const proposal: ConsolidationProposal = {
      id: 'prop-promote-mixed',
      type: 'promote',
      scope: 'test',
      affected_ids: ['ep-1', 'ep-2'],
      before: {},
      after: { content: 'Mixed', confidence: 0.6 } as Record<string, unknown>,
      score: 10,
      created_at: new Date().toISOString(),
    };

    const promoteFromEpisodic = vi.fn().mockResolvedValue('new-id');
    let call = 0;
    const episodicGetById = vi.fn().mockImplementation(() => {
      call++;
      return Promise.resolve({
        id: `ep-${call}`,
        session_id: 's',
        agent_id: 'a',
        task: 't',
        content: 'c',
        created_at: new Date().toISOString(),
        tenant_id: call === 1 ? 'acme' : 'globex',
      });
    });

    const redis = makeRedis({
      proposals: {
        save: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(proposal),
        listPending: vi.fn().mockResolvedValue(['prop-promote-mixed']),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    });
    const neo4j = makeNeo4j({
      semantic: {
        getById: vi.fn().mockResolvedValue(null),
        updateConfidence: vi.fn().mockResolvedValue(undefined),
        supersede: vi.fn().mockResolvedValue('x'),
        promoteFromEpisodic,
      },
      episodic: { getById: episodicGetById },
    });

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());
    await engine.reviewProposal('prop-promote-mixed', 'approve');

    expect(promoteFromEpisodic).toHaveBeenCalledWith(
      'ep-1',
      expect.objectContaining({ tenant_id: 'default' }),
      'default',
    );
  });
});

describe('ConsolidationEngine.status', () => {
  it('returns list of pending proposal IDs', async () => {
    const redis = makeRedis({
      proposals: {
        save: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        listPending: vi.fn().mockResolvedValue(['prop-a', 'prop-b', 'prop-c']),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    });
    const neo4j = makeNeo4j();

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());
    const status = await engine.status();

    expect(status.pending).toEqual(['prop-a', 'prop-b', 'prop-c']);
  });

  it('returns empty list when no pending proposals', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();

    const engine = new ConsolidationEngine(redis, neo4j, makeConfig());
    const status = await engine.status();

    expect(status.pending).toHaveLength(0);
  });
});
