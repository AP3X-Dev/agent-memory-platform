// packages/core/src/__tests__/service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AMPService } from '../service.js';
import type { RedisLayer, Neo4jLayer, FactLayer, BlocksLayer } from '../service.js';
import type { AMPConfig, LoadScope, EpisodeInput, SemanticNode, FactNode, MemoryBlock } from '../types.js';

// Mock extractFacts — we test the wiring, not the OpenAI call.
// Preserve isTransientError from the real module for retry logic.
vi.mock('../extract.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../extract.js')>();
  return {
    ...actual,
    extractFacts: vi.fn().mockResolvedValue([]),
  };
});
import { extractFacts } from '../extract.js';
const mockExtractFacts = vi.mocked(extractFacts);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSemanticNode(overrides: Partial<SemanticNode> = {}): SemanticNode {
  return {
    id: 'sem-1',
    content: 'Test semantic content about agents',
    confidence: 0.8,
    signal_count: 3,
    created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    decay_class: 'stable',
    tags: ['agent', 'test'],
    ...overrides,
  };
}

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

// ─── Mock factories ────────────────────────────────────────────────────────────

function makeRedis(overrides: Partial<RedisLayer> = {}): RedisLayer {
  return {
    cache: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      invalidateByScope: vi.fn().mockResolvedValue(0),
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

function makeNeo4j(overrides: Partial<Neo4jLayer> = {}): Neo4jLayer {
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
      byVector: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

function makeEmbedding() {
  return {
    embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
    embedBatch: vi.fn().mockResolvedValue([]),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AMPService.load', () => {
  it('returns cached context on cache hit', async () => {
    const cachedCtx = {
      markdown: '# Memory Context\n',
      tokens: 100,
      sources: ['sem-1'],
      assembled_at: new Date().toISOString(),
    };

    const redis = makeRedis({
      cache: {
        get: vi.fn().mockResolvedValue(cachedCtx),
        set: vi.fn().mockResolvedValue(undefined),
        invalidateByScope: vi.fn().mockResolvedValue(0),
        invalidateByNodeId: vi.fn().mockResolvedValue(0),
      },
    });
    const neo4j = makeNeo4j();
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const scope: LoadScope = { task: 'test task', max_tokens: 2000 };
    const result = await service.load(scope);

    expect(result).toBe(cachedCtx);
    expect(redis.cache.get).toHaveBeenCalledOnce();
    // Neo4j should NOT be queried on cache hit
    expect(neo4j.query.byScope).not.toHaveBeenCalled();
    expect(neo4j.query.byVector).not.toHaveBeenCalled();
  });

  it('queries Neo4j on cache miss and caches result', async () => {
    const nodes: SemanticNode[] = [
      makeSemanticNode({ id: 'sem-1', content: 'A'.repeat(40) }),
      makeSemanticNode({ id: 'sem-2', content: 'B'.repeat(40), tags: ['other'] }),
    ];

    const redis = makeRedis();
    const neo4j = makeNeo4j({
      query: {
        byScope: vi.fn().mockResolvedValue(nodes),
        byVector: vi.fn().mockResolvedValue([]),
      },
    });
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const scope: LoadScope = { task: 'build agent', entities: ['agent'], max_tokens: 2000 };
    const result = await service.load(scope);

    expect(neo4j.query.byScope).toHaveBeenCalledOnce();
    expect(result.sources).toContain('sem-1');
    expect(result.markdown).toContain('# Memory Context');
    expect(result.tokens).toBeGreaterThan(0);
    // Should cache the result
    expect(redis.cache.set).toHaveBeenCalledOnce();
  });

  it('tracks both tag and entity keys for targeted cache invalidation', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const scope: LoadScope = {
      task: 'load auth context',
      entities: ['auth-module'],
      tags: ['project:test'],
      max_tokens: 2000,
    };
    await service.load(scope);

    expect(redis.cache.set).toHaveBeenCalledOnce();
    const cacheScopeKeys = vi.mocked(redis.cache.set).mock.calls[0][4];
    expect(cacheScopeKeys).toEqual(expect.arrayContaining(['project:test', 'auth-module']));
  });

  it('merges byScope and byVector results, deduplicating by id', async () => {
    const sharedNode = makeSemanticNode({ id: 'shared', content: 'C'.repeat(40) });
    const uniqueNode = makeSemanticNode({ id: 'unique', content: 'D'.repeat(40) });

    const redis = makeRedis();
    const neo4j = makeNeo4j({
      query: {
        byScope: vi.fn().mockResolvedValue([sharedNode]),
        byVector: vi.fn().mockResolvedValue([
          { ...sharedNode, score: 0.9 },
          { ...uniqueNode, score: 0.7 },
        ]),
      },
    });
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const scope: LoadScope = { task: 'dedup test', max_tokens: 2000 };
    const result = await service.load(scope);

    // shared should appear exactly once
    expect(result.sources.filter((id) => id === 'shared')).toHaveLength(1);
    expect(result.sources).toContain('unique');
  });

  it('respects max_tokens budget', async () => {
    // Each node content is 200 chars → ~50 tokens
    const nodes: SemanticNode[] = Array.from({ length: 10 }, (_, i) =>
      makeSemanticNode({ id: `sem-${i}`, content: 'X'.repeat(200) }),
    );

    const redis = makeRedis();
    const neo4j = makeNeo4j({
      query: {
        byScope: vi.fn().mockResolvedValue(nodes),
        byVector: vi.fn().mockResolvedValue([]),
      },
    });
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    // Limit to 100 tokens → should include at most 2 nodes (each ~50 tokens)
    const scope: LoadScope = { task: 'budget test', max_tokens: 100 };
    const result = await service.load(scope);

    expect(result.tokens).toBeLessThanOrEqual(100);
    expect(result.sources.length).toBeLessThan(10);
  });

  it('returns empty context when Neo4j has no results', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const scope: LoadScope = { task: 'empty task' };
    const result = await service.load(scope);

    expect(result.sources).toHaveLength(0);
    expect(result.tokens).toBe(0);
    expect(result.markdown).toContain('No relevant memories found');
  });
});

describe('AMPService.store', () => {
  it('skips duplicate store and returns duplicate flag', async () => {
    const redis = makeRedis({
      dedup: {
        isDuplicate: vi.fn().mockResolvedValue(true),
        markSeen: vi.fn().mockResolvedValue(undefined),
        checkAndMark: vi.fn().mockResolvedValue(true),
      },
    });
    const neo4j = makeNeo4j();
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-1',
      agent_id: 'agent-1',
      task: 'test task',
      content: 'This content was already stored',
    };

    const result = await service.store(input);

    expect(result.duplicate).toBe(true);
    expect(result.id).toBe('');
    // Neo4j should not be called
    expect(neo4j.episodic.create).not.toHaveBeenCalled();
  });

  it('stores a new episode and returns id', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-1',
      agent_id: 'agent-1',
      task: 'test task',
      content: 'New unique content to store',
    };

    const result = await service.store(input);

    expect(result.duplicate).toBe(false);
    expect(result.id).toBeTruthy();
    expect(neo4j.episodic.create).toHaveBeenCalledOnce();
    expect(neo4j.episodic.linkToAgent).toHaveBeenCalledWith(result.id, 'agent-1');
    expect(redis.dedup.checkAndMark).toHaveBeenCalledOnce();
  });

  it('invalidates tag and entity scoped context caches after storing a new episode', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-cache-1',
      agent_id: 'agent-1',
      task: 'update auth memory',
      content: 'Auth module now prefers PKCE.',
      tags: ['project:test', 'feature:auth'],
      entities: ['auth-module'],
    };

    const result = await service.store(input);

    expect(result.duplicate).toBe(false);
    expect(redis.cache.invalidateByScope).toHaveBeenCalledWith('project:test');
    expect(redis.cache.invalidateByScope).toHaveBeenCalledWith('feature:auth');
    expect(redis.cache.invalidateByScope).toHaveBeenCalledWith('auth-module');
  });

  it('publishes signals and invalidates caches when signals are present', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-2',
      agent_id: 'agent-1',
      task: 'test task',
      content: 'Content with signals',
      signals: [
        { type: 'reinforcement', target_id: 'sem-99', detail: 'Confirms prior knowledge' },
        { type: 'correction', target_id: 'sem-100', detail: 'Corrects prior belief' },
      ],
    };

    const result = await service.store(input);

    expect(result.duplicate).toBe(false);
    expect(redis.signals.publish).toHaveBeenCalledTimes(2);
    expect(redis.cache.invalidateByNodeId).toHaveBeenCalledWith('sem-99');
    expect(redis.cache.invalidateByNodeId).toHaveBeenCalledWith('sem-100');
    expect(neo4j.episodic.linkSignal).toHaveBeenCalledTimes(2);
    expect(redis.queue.incrementScore).toHaveBeenCalledTimes(2);
  });

  it('links entities and model when provided', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-3',
      agent_id: 'agent-1',
      task: 'test task',
      content: 'Content with entities',
      entities: ['entity-a', 'entity-b'],
      model_id: 'model-gpt4',
    };

    await service.store(input);

    expect(neo4j.episodic.linkToEntity).toHaveBeenCalledWith(expect.any(String), 'entity-a');
    expect(neo4j.episodic.linkToEntity).toHaveBeenCalledWith(expect.any(String), 'entity-b');
    expect(neo4j.episodic.linkToModel).toHaveBeenCalledWith(expect.any(String), 'model-gpt4');
  });

  it('uses cached embedding if available', async () => {
    const cachedEmbedding = new Array(1536).fill(0.5);
    const redis = makeRedis({
      embeddings: {
        get: vi.fn().mockResolvedValue(cachedEmbedding),
        set: vi.fn().mockResolvedValue(undefined),
      },
    });
    const neo4j = makeNeo4j();
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-4',
      agent_id: 'agent-1',
      task: 'test',
      content: 'Content already embedded',
    };

    await service.store(input);

    // embedding.embed should NOT be called since cache hit
    expect(embedding.embed).not.toHaveBeenCalled();
    expect(redis.embeddings.set).not.toHaveBeenCalled();
  });
});

// ─── Memory blocks integration ──────────────────────────────────────────────

function makeMemoryBlock(overrides: Partial<MemoryBlock> = {}): MemoryBlock {
  const now = new Date().toISOString();
  return {
    id: 'block-1',
    name: 'persona',
    tier: 'core',
    content: 'You are a helpful assistant.',
    scope: 'project:test',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeBlocksLayer(overrides: Partial<BlocksLayer> = {}): BlocksLayer {
  return {
    listBlocks: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('AMPService.load with memory blocks', () => {
  it('renders core blocks before semantic knowledge', async () => {
    const coreBlock = makeMemoryBlock({ name: 'persona', content: 'Test persona content' });
    const blocks = makeBlocksLayer({
      listBlocks: vi.fn().mockImplementation((_scope: string, tier?: string) => {
        if (tier === 'core') return Promise.resolve([coreBlock]);
        return Promise.resolve([]);
      }),
    });

    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig(), blocks);

    const scope: LoadScope = { task: 'test', tags: ['project:test'] };
    const result = await service.load(scope);

    expect(result.markdown).toContain('## Core Memory');
    expect(result.markdown).toContain('### persona');
    expect(result.markdown).toContain('Test persona content');
    // Core memory should appear before semantic section
    const coreIdx = result.markdown.indexOf('## Core Memory');
    const semanticIdx = result.markdown.indexOf('# Memory Context');
    expect(coreIdx).toBeLessThan(semanticIdx);
  });

  it('renders working blocks when session_id is provided', async () => {
    const workingBlock = makeMemoryBlock({
      name: 'working_state',
      tier: 'working',
      content: 'Current debug progress',
      session_id: 'sess-1',
    });
    const blocks = makeBlocksLayer({
      listBlocks: vi.fn().mockImplementation((_scope: string, tier?: string) => {
        if (tier === 'working') return Promise.resolve([workingBlock]);
        return Promise.resolve([]);
      }),
    });

    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig(), blocks);

    const scope: LoadScope = { task: 'test', tags: ['project:test'], session_id: 'sess-1' };
    const result = await service.load(scope);

    expect(result.markdown).toContain('## Working Memory');
    expect(result.markdown).toContain('### working_state');
    expect(result.markdown).toContain('Current debug progress');
  });

  it('skips blocks section when no blocks service is provided', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const scope: LoadScope = { task: 'test', tags: ['project:test'] };
    const result = await service.load(scope);

    expect(result.markdown).not.toContain('## Core Memory');
    expect(result.markdown).not.toContain('## Working Memory');
  });

  it('skips empty blocks', async () => {
    const emptyBlock = makeMemoryBlock({ name: 'persona', content: '' });
    const blocks = makeBlocksLayer({
      listBlocks: vi.fn().mockImplementation((_scope: string, tier?: string) => {
        if (tier === 'core') return Promise.resolve([emptyBlock]);
        return Promise.resolve([]);
      }),
    });

    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig(), blocks);

    const scope: LoadScope = { task: 'test', tags: ['project:test'] };
    const result = await service.load(scope);

    expect(result.markdown).not.toContain('## Core Memory');
  });

  it('applies per-tier token budgets to blocks', async () => {
    const bigBlock = makeMemoryBlock({
      name: 'persona',
      content: 'X'.repeat(1000), // ~250 tokens, will be truncated to 15% of budget
    });
    const nodes: SemanticNode[] = [
      makeSemanticNode({ id: 'sem-1', content: 'A'.repeat(200) }),
    ];
    const blocks = makeBlocksLayer({
      listBlocks: vi.fn().mockImplementation((_scope: string, tier?: string) => {
        if (tier === 'core') return Promise.resolve([bigBlock]);
        return Promise.resolve([]);
      }),
    });

    const redis = makeRedis();
    const neo4j = makeNeo4j({
      query: {
        byScope: vi.fn().mockResolvedValue(nodes),
        byVector: vi.fn().mockResolvedValue([]),
      },
    });
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig(), blocks);

    // With a 2000-token budget, core gets 15% = 300 tokens
    const scope: LoadScope = { task: 'test', tags: ['project:test'], max_tokens: 2000 };
    const result = await service.load(scope);

    expect(result.markdown).toContain('## Core Memory');
    expect(result.markdown).toContain('persona');
    // Block content is included (fits within 300-token core budget)
    expect(result.markdown).toContain('X'.repeat(100));
  });

  it('uses project tag from tags array', async () => {
    const blocks = makeBlocksLayer();
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig(), blocks);

    const scope: LoadScope = { task: 'test', tags: ['project:my-proj', 'other-tag'] };
    await service.load(scope);

    expect(blocks.listBlocks).toHaveBeenCalledWith('project:my-proj', 'core');
  });

  it('PERF-REGRESSION: fans out blocks, byScope, byVector, and facts concurrently', async () => {
    // The independent load branches (core blocks, semantic byScope, vector
    // search, entity facts) must all be in flight at once — collapsing what
    // used to be three sequential round-trip phases into one. We assert this
    // with a barrier: every branch increments a counter on entry and then
    // awaits a shared promise that only resolves once all four have entered.
    // If load() ever reverts to awaiting one branch before starting the next,
    // the barrier never fills and this test deadlocks → times out → fails.
    const EXPECTED = 4; // core blocks, byScope, byVector, fact.getActive
    let entered = 0;
    let release!: () => void;
    const allEntered = new Promise<void>((r) => { release = r; });
    const gate = (): Promise<void> => {
      if (++entered >= EXPECTED) release();
      return allEntered;
    };

    const blocks: BlocksLayer = {
      listBlocks: vi.fn().mockImplementation(async (_scope: string, tier: string) => {
        if (tier === 'core') await gate();
        return [];
      }),
    };
    const factLayer = makeFactLayer();
    vi.mocked(factLayer.getActive).mockImplementation(async () => { await gate(); return []; });
    const redis = makeRedis();
    const neo4j = makeNeo4j({
      query: {
        byScope: vi.fn().mockImplementation(async () => { await gate(); return []; }),
        byVector: vi.fn().mockImplementation(async () => { await gate(); return []; }),
      },
      fact: factLayer,
    });
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig(), blocks);

    const scope: LoadScope = {
      task: 'concurrent load',
      entities: ['agent'],
      tags: ['project:test'],
      session_id: 'sess-1',
      max_tokens: 2000,
    };
    await service.load(scope);

    expect(entered).toBe(EXPECTED);
  });
});

// ─── Real-time fact extraction in store ─────────────────────────────────────

function makeFactLayer(): FactLayer {
  return {
    getActive: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue('fact-1'),
    findBySubjectPredicate: vi.fn().mockResolvedValue([]),
    invalidate: vi.fn().mockResolvedValue(undefined),
    linkCoExtracted: vi.fn().mockResolvedValue(undefined),
    updateConfidence: vi.fn().mockResolvedValue(undefined),
    corroborate: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFactNode(overrides: Partial<FactNode> = {}): FactNode {
  const now = new Date().toISOString();
  return {
    id: 'fact-existing',
    subject: 'auth-module',
    predicate: 'uses',
    object: 'JWT',
    entity_id: 'ent-1',
    source_episode_ids: ['ep-old'],
    valid_at: now,
    invalid_at: null,
    confidence: 0.5,
    status: 'active',
    supersedes_fact_id: null,
    scope: 'project',
    tags: [],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// Helper to flush fire-and-forget promises (fact extraction runs in background)
async function flushAsync(): Promise<void> {
  await new Promise((r) => setTimeout(r, 10));
}

describe('AMPService.store — real-time fact extraction', () => {
  beforeEach(() => {
    mockExtractFacts.mockReset();
    mockExtractFacts.mockResolvedValue([]);
  });

  it('extracts facts and creates them when fact layer is available', async () => {
    const factLayer = makeFactLayer();
    mockExtractFacts.mockResolvedValue([
      { subject: 'auth-module', predicate: 'uses', object: 'JWT', source_episode_ids: [] },
    ]);

    const redis = makeRedis();
    const neo4j = makeNeo4j({ fact: factLayer });
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-fact-1',
      agent_id: 'agent-1',
      task: 'test task',
      content: 'The auth module uses JWT for authentication',
    };

    const result = await service.store(input);
    await flushAsync(); // Wait for fire-and-forget extraction

    expect(result.duplicate).toBe(false);
    expect(result.id).toBeTruthy();
    expect(mockExtractFacts).toHaveBeenCalledWith(input.content, 'test-key', undefined); // 3rd arg = config.models?.extraction
    expect(factLayer.findBySubjectPredicate).toHaveBeenCalledWith('auth-module', 'uses', 'default');
    expect(factLayer.create).toHaveBeenCalledOnce();
    // Verify the created fact
    const createdFact = (factLayer.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as FactNode;
    expect(createdFact.subject).toBe('auth-module');
    expect(createdFact.predicate).toBe('uses');
    expect(createdFact.object).toBe('JWT');
    expect(createdFact.status).toBe('active');
    expect(createdFact.inference_type).toBe('deductive'); // explicit capture
    expect(createdFact.source_episode_ids).toEqual([result.id]);
    expect(createdFact.confidence).toBe(0.5);
    expect(createdFact.supersedes_fact_id).toBeNull();
    expect(redis.cache.invalidateByScope).toHaveBeenCalledWith('auth-module');
  });

  it('promotes a corroborated ABDUCTIVE (dream) fact to deductive on reinforcement', async () => {
    const existing = makeFactNode({ id: 'fact-dream', object: 'JWT', status: 'tentative', inference_type: 'abductive', confidence: 0.3 });
    const factLayer = makeFactLayer();
    (factLayer.findBySubjectPredicate as ReturnType<typeof vi.fn>).mockResolvedValue([existing]);
    mockExtractFacts.mockResolvedValue([
      { subject: 'auth-module', predicate: 'uses', object: 'JWT', source_episode_ids: [] },
    ]);

    const service = new AMPService(makeRedis(), makeNeo4j({ fact: factLayer }), makeEmbedding(), makeConfig());
    await service.store({ session_id: 's', agent_id: 'a', task: 't', content: 'auth uses JWT' });
    await flushAsync();

    expect(factLayer.corroborate).toHaveBeenCalledWith('fact-dream', expect.any(Number));
    expect(factLayer.create).not.toHaveBeenCalled(); // reinforcing → no new fact
  });

  it('does NOT promote an INDUCTIVE (consolidation) fact on reinforcement — provenance stays inductive', async () => {
    const existing = makeFactNode({ id: 'fact-ind', object: 'JWT', status: 'tentative', inference_type: 'inductive', confidence: 0.5 });
    const factLayer = makeFactLayer();
    (factLayer.findBySubjectPredicate as ReturnType<typeof vi.fn>).mockResolvedValue([existing]);
    mockExtractFacts.mockResolvedValue([
      { subject: 'auth-module', predicate: 'uses', object: 'JWT', source_episode_ids: [] },
    ]);

    const service = new AMPService(makeRedis(), makeNeo4j({ fact: factLayer }), makeEmbedding(), makeConfig());
    await service.store({ session_id: 's', agent_id: 'a', task: 't', content: 'auth uses JWT' });
    await flushAsync();

    expect(factLayer.corroborate).not.toHaveBeenCalled(); // inductive must not be promoted
    expect(factLayer.create).not.toHaveBeenCalled();
  });

  it('auto-invalidates conflicting fact and creates replacement with supersedes_fact_id', async () => {
    const existingFact = makeFactNode({ id: 'fact-old', object: 'session-cookies' });
    const factLayer = makeFactLayer();
    (factLayer.findBySubjectPredicate as ReturnType<typeof vi.fn>).mockResolvedValue([existingFact]);

    mockExtractFacts.mockResolvedValue([
      { subject: 'auth-module', predicate: 'uses', object: 'JWT', source_episode_ids: [] },
    ]);

    const redis = makeRedis();
    const neo4j = makeNeo4j({ fact: factLayer });
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-fact-2',
      agent_id: 'agent-1',
      task: 'refactor auth',
      content: 'Migrated auth module to use JWT instead of session cookies',
    };

    const result = await service.store(input);
    await flushAsync(); // Wait for fire-and-forget extraction

    expect(result.duplicate).toBe(false);
    // Old fact should be invalidated
    expect(factLayer.invalidate).toHaveBeenCalledOnce();
    const invalidateArgs = (factLayer.invalidate as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(invalidateArgs[0]).toBe('fact-old');
    // New fact should be created with supersedes_fact_id
    expect(factLayer.create).toHaveBeenCalledOnce();
    const createdFact = (factLayer.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as FactNode;
    expect(createdFact.object).toBe('JWT');
    expect(createdFact.supersedes_fact_id).toBe('fact-old');
    // Invalidate receives the new fact's ID
    expect(invalidateArgs[2]).toBe(createdFact.id);
  });

  it('skips creation when reinforcing fact already exists (same subject+predicate+object)', async () => {
    const existingFact = makeFactNode({ id: 'fact-old', object: 'JWT' });
    const factLayer = makeFactLayer();
    (factLayer.findBySubjectPredicate as ReturnType<typeof vi.fn>).mockResolvedValue([existingFact]);

    mockExtractFacts.mockResolvedValue([
      { subject: 'auth-module', predicate: 'uses', object: 'JWT', source_episode_ids: [] },
    ]);

    const redis = makeRedis();
    const neo4j = makeNeo4j({ fact: factLayer });
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-fact-3',
      agent_id: 'agent-1',
      task: 'verify auth',
      content: 'Confirmed auth module uses JWT',
    };

    const result = await service.store(input);

    expect(result.duplicate).toBe(false);
    // No new fact created — existing fact is reinforcing
    expect(factLayer.create).not.toHaveBeenCalled();
    expect(factLayer.invalidate).not.toHaveBeenCalled();
  });

  it('stores episode successfully when no API key is configured (no fact extraction)', async () => {
    const factLayer = makeFactLayer();
    const redis = makeRedis();
    const neo4j = makeNeo4j({ fact: factLayer });
    const embedding = makeEmbedding();
    const configNoKey = makeConfig();
    configNoKey.embedding.apiKey = '';

    const service = new AMPService(redis, neo4j, embedding, configNoKey);

    const input: EpisodeInput = {
      session_id: 'sess-fact-4',
      agent_id: 'agent-1',
      task: 'test task',
      content: 'Content without fact extraction',
    };

    const result = await service.store(input);

    expect(result.duplicate).toBe(false);
    expect(result.id).toBeTruthy();
    // extractFacts should not be called when there's no API key
    expect(mockExtractFacts).not.toHaveBeenCalled();
    expect(factLayer.create).not.toHaveBeenCalled();
  });

  it('stores episode successfully when fact layer is not available', async () => {
    mockExtractFacts.mockResolvedValue([
      { subject: 'test', predicate: 'has', object: 'value', source_episode_ids: [] },
    ]);

    const redis = makeRedis();
    const neo4j = makeNeo4j(); // no fact layer
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-fact-5',
      agent_id: 'agent-1',
      task: 'test task',
      content: 'Content without fact layer',
    };

    const result = await service.store(input);

    expect(result.duplicate).toBe(false);
    expect(result.id).toBeTruthy();
    // extractFacts should not be called when there's no fact layer
    expect(mockExtractFacts).not.toHaveBeenCalled();
  });

  it('stores episode successfully even when fact extraction throws non-transient error', async () => {
    const factLayer = makeFactLayer();
    // Non-transient error (e.g., auth) — should not be retried
    mockExtractFacts.mockRejectedValue(new Error('Invalid API key'));

    const redis = makeRedis();
    const neo4j = makeNeo4j({ fact: factLayer });
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const input: EpisodeInput = {
      session_id: 'sess-fact-6',
      agent_id: 'agent-1',
      task: 'test task',
      content: 'Content where extraction fails',
    };

    const result = await service.store(input);
    await flushAsync(); // Wait for fire-and-forget extraction to fail

    expect(result.duplicate).toBe(false);
    expect(result.id).toBeTruthy();
    // Episode is stored, Neo4j was called
    expect(neo4j.episodic.create).toHaveBeenCalledOnce();
    // Error was logged (non-transient: no retries, immediate failure)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[amp-store] Fact extraction failed after retries'),
      expect.stringContaining('Invalid API key'),
    );
    // extractFacts called exactly once (no retries for non-transient errors)
    expect(mockExtractFacts).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('retries fact extraction on transient errors with exponential backoff', async () => {
    vi.useFakeTimers();
    const factLayer = makeFactLayer();
    // First two calls fail with transient error, third succeeds
    mockExtractFacts
      .mockRejectedValueOnce(new Error('429 rate limit exceeded'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce([
        { subject: 'auth-module', predicate: 'uses', object: 'JWT', source_episode_ids: [] },
      ]);

    const redis = makeRedis();
    const neo4j = makeNeo4j({ fact: factLayer });
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const input: EpisodeInput = {
      session_id: 'sess-retry',
      agent_id: 'agent-1',
      task: 'test task',
      content: 'Content that needs retries',
    };

    const result = await service.store(input);

    // Advance timers through all retry delays
    // First retry delay: 3^0 * 1000 = 1000ms
    await vi.advanceTimersByTimeAsync(1100);
    // Second retry delay: 3^1 * 1000 = 3000ms
    await vi.advanceTimersByTimeAsync(3100);

    // Wait for microtasks to settle
    await vi.advanceTimersByTimeAsync(100);

    expect(result.duplicate).toBe(false);
    expect(result.id).toBeTruthy();
    // extractFacts called 3 times (initial + 2 retries)
    expect(mockExtractFacts).toHaveBeenCalledTimes(3);
    // Warn logged for each retry attempt
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('attempt 1 failed, retrying in 1000ms'),
      expect.stringContaining('429'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('attempt 2 failed, retrying in 3000ms'),
      expect.stringContaining('ECONNRESET'),
    );
    // Fact was created on the third attempt
    expect(factLayer.create).toHaveBeenCalledOnce();

    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('handles multiple extracted facts in a single store', async () => {
    const factLayer = makeFactLayer();
    mockExtractFacts.mockResolvedValue([
      { subject: 'auth-module', predicate: 'uses', object: 'JWT', source_episode_ids: [] },
      { subject: 'auth-module', predicate: 'depends_on', object: 'redis', source_episode_ids: [] },
    ]);

    const redis = makeRedis();
    const neo4j = makeNeo4j({ fact: factLayer });
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-fact-7',
      agent_id: 'agent-1',
      task: 'document auth',
      content: 'Auth module uses JWT and depends on Redis for session caching',
    };

    const result = await service.store(input);
    await flushAsync(); // Wait for fire-and-forget extraction

    expect(result.duplicate).toBe(false);
    // "depends_on" normalizes to "uses", so both facts use "uses" predicate
    expect(factLayer.create).toHaveBeenCalledTimes(2);
    expect(factLayer.findBySubjectPredicate).toHaveBeenCalledTimes(2);
  });
});

// ─── Feature 1: Co-extracted fact linkage (SAME_EPISODE edges) ──────────────

describe('AMPService.store — co-extracted fact linkage', () => {
  beforeEach(() => {
    mockExtractFacts.mockReset();
    mockExtractFacts.mockResolvedValue([]);
  });

  it('links co-extracted facts with SAME_EPISODE edges when 3 facts are produced', async () => {
    const factLayer = makeFactLayer();
    mockExtractFacts.mockResolvedValue([
      { subject: 'api-module', predicate: 'uses', object: 'Express', source_episode_ids: [] },
      { subject: 'api-module', predicate: 'implements', object: 'REST', source_episode_ids: [] },
      { subject: 'api-module', predicate: 'has', object: 'rate-limiting', source_episode_ids: [] },
    ]);

    const redis = makeRedis();
    const neo4j = makeNeo4j({ fact: factLayer });
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-co-1',
      agent_id: 'agent-1',
      task: 'document api',
      content: 'API module uses Express, implements REST, and has rate-limiting',
    };

    await service.store(input);
    await flushAsync();

    // 3 facts created
    expect(factLayer.create).toHaveBeenCalledTimes(3);
    // 3 SAME_EPISODE edges: (0,1), (0,2), (1,2)
    expect(factLayer.linkCoExtracted).toHaveBeenCalledTimes(3);
  });

  it('does not call linkCoExtracted when only 1 fact is produced', async () => {
    const factLayer = makeFactLayer();
    mockExtractFacts.mockResolvedValue([
      { subject: 'api-module', predicate: 'uses', object: 'Express', source_episode_ids: [] },
    ]);

    const redis = makeRedis();
    const neo4j = makeNeo4j({ fact: factLayer });
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-co-2',
      agent_id: 'agent-1',
      task: 'note',
      content: 'API uses Express',
    };

    await service.store(input);
    await flushAsync();

    expect(factLayer.create).toHaveBeenCalledTimes(1);
    expect(factLayer.linkCoExtracted).not.toHaveBeenCalled();
  });

  it('degrades gracefully when linkCoExtracted is not implemented', async () => {
    const factLayer = makeFactLayer();
    delete (factLayer as unknown as Record<string, unknown>).linkCoExtracted;
    mockExtractFacts.mockResolvedValue([
      { subject: 'api-module', predicate: 'uses', object: 'Express', source_episode_ids: [] },
      { subject: 'api-module', predicate: 'has', object: 'middleware', source_episode_ids: [] },
    ]);

    const redis = makeRedis();
    const neo4j = makeNeo4j({ fact: factLayer });
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-co-3',
      agent_id: 'agent-1',
      task: 'note',
      content: 'API uses Express and has middleware',
    };

    await service.store(input);
    await flushAsync();

    // Facts still created even without linkCoExtracted
    expect(factLayer.create).toHaveBeenCalledTimes(2);
  });
});

// ─── Feature 2: Graph-structural retrieval (neighbor expansion) ─────────────

describe('AMPService.load — graph expansion', () => {
  it('calls expandByGraph with entity names from semantic results', async () => {
    const expandedNode = makeSemanticNode({
      id: 'sem-expanded',
      content: 'Related knowledge from graph neighbor',
      tags: ['related-entity'],
    });
    const directNode = makeSemanticNode({
      id: 'sem-direct',
      content: 'Direct match for **auth-module** usage',
      tags: ['auth-module'],
    });

    const expandByGraph = vi.fn().mockResolvedValue([expandedNode]);
    const redis = makeRedis();
    const neo4j = makeNeo4j({
      query: {
        byScope: vi.fn().mockResolvedValue([directNode]),
        byVector: vi.fn().mockResolvedValue([]),
        expandByGraph,
      },
    });
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());
    const scope: LoadScope = { task: 'test expansion', max_tokens: 4000 };
    const result = await service.load(scope);

    expect(expandByGraph).toHaveBeenCalledOnce();
    // The expanded node should be included in the results
    expect(result.sources).toContain('sem-expanded');
    expect(result.sources).toContain('sem-direct');
  });

  it('skips graph expansion when expandByGraph is not available', async () => {
    const directNode = makeSemanticNode({
      id: 'sem-direct',
      content: 'Direct match content',
      tags: ['test-tag'],
    });

    const redis = makeRedis();
    const neo4j = makeNeo4j({
      query: {
        byScope: vi.fn().mockResolvedValue([directNode]),
        byVector: vi.fn().mockResolvedValue([]),
        // No expandByGraph
      },
    });
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());
    const scope: LoadScope = { task: 'test', max_tokens: 4000 };
    const result = await service.load(scope);

    expect(result.sources).toContain('sem-direct');
  });

  it('handles expandByGraph errors gracefully', async () => {
    const directNode = makeSemanticNode({
      id: 'sem-direct',
      content: 'Direct match content',
      tags: ['test-tag'],
    });

    const expandByGraph = vi.fn().mockRejectedValue(new Error('Neo4j error'));
    const redis = makeRedis();
    const neo4j = makeNeo4j({
      query: {
        byScope: vi.fn().mockResolvedValue([directNode]),
        byVector: vi.fn().mockResolvedValue([]),
        expandByGraph,
      },
    });
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());
    const scope: LoadScope = { task: 'test', max_tokens: 4000 };
    const result = await service.load(scope);

    // Should still return direct results despite expansion failure
    expect(result.sources).toContain('sem-direct');
  });

  it('deduplicates expanded nodes against direct results', async () => {
    const sharedNode = makeSemanticNode({
      id: 'sem-shared',
      content: 'Appears in both direct and expanded',
      tags: ['test-tag'],
    });

    const expandByGraph = vi.fn().mockResolvedValue([sharedNode]);
    const redis = makeRedis();
    const neo4j = makeNeo4j({
      query: {
        byScope: vi.fn().mockResolvedValue([sharedNode]),
        byVector: vi.fn().mockResolvedValue([]),
        expandByGraph,
      },
    });
    const embedding = makeEmbedding();

    const service = new AMPService(redis, neo4j, embedding, makeConfig());
    const scope: LoadScope = { task: 'test dedup', max_tokens: 4000 };
    const result = await service.load(scope);

    // Should appear exactly once
    expect(result.sources.filter((id) => id === 'sem-shared')).toHaveLength(1);
  });
});

// ─── Feature 3: Staleness detection for unmentioned facts ───────────────────

describe('AMPService.store — staleness detection', () => {
  beforeEach(() => {
    mockExtractFacts.mockReset();
    mockExtractFacts.mockResolvedValue([]);
  });

  it('decays confidence of unmentioned facts when entity has thorough coverage', async () => {
    const existingUnmentionedFact = makeFactNode({
      id: 'fact-stale',
      subject: 'auth-module',
      predicate: 'has',
      object: 'session-cookies',
      confidence: 0.8,
    });

    const factLayer = makeFactLayer();
    // getActive returns the existing unmentioned fact
    (factLayer.getActive as ReturnType<typeof vi.fn>).mockResolvedValue([existingUnmentionedFact]);

    // Extract 2 facts about auth-module (thorough coverage threshold)
    mockExtractFacts.mockResolvedValue([
      { subject: 'auth-module', predicate: 'uses', object: 'JWT', source_episode_ids: [] },
      { subject: 'auth-module', predicate: 'implements', object: 'OAuth2', source_episode_ids: [] },
    ]);

    const redis = makeRedis();
    const neo4j = makeNeo4j({ fact: factLayer });
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-stale-1',
      agent_id: 'agent-1',
      task: 'update auth docs',
      content: 'Auth module uses JWT and implements OAuth2',
    };

    await service.store(input);
    await flushAsync();

    // The unmentioned fact should have its confidence decayed (0.8 * 0.9 ≈ 0.72)
    expect(factLayer.updateConfidence).toHaveBeenCalledTimes(1);
    const [calledId, calledConfidence] = (factLayer.updateConfidence as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(calledId).toBe('fact-stale');
    expect(calledConfidence).toBeCloseTo(0.72, 10);
  });

  it('does not decay facts when entity has only 1 extracted fact (not thorough)', async () => {
    const existingFact = makeFactNode({
      id: 'fact-safe',
      subject: 'auth-module',
      predicate: 'has',
      object: 'logging',
      confidence: 0.8,
    });

    const factLayer = makeFactLayer();
    (factLayer.getActive as ReturnType<typeof vi.fn>).mockResolvedValue([existingFact]);

    // Only 1 fact about auth-module — below thorough coverage threshold
    mockExtractFacts.mockResolvedValue([
      { subject: 'auth-module', predicate: 'uses', object: 'JWT', source_episode_ids: [] },
    ]);

    const redis = makeRedis();
    const neo4j = makeNeo4j({ fact: factLayer });
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-stale-2',
      agent_id: 'agent-1',
      task: 'note auth',
      content: 'Auth module uses JWT',
    };

    await service.store(input);
    await flushAsync();

    // Should NOT decay — only 1 fact, not thorough coverage
    expect(factLayer.updateConfidence).not.toHaveBeenCalled();
  });

  it('does not decay facts below the 0.1 floor', async () => {
    const lowConfidenceFact = makeFactNode({
      id: 'fact-low',
      subject: 'auth-module',
      predicate: 'has',
      object: 'old-feature',
      confidence: 0.1,
    });

    const factLayer = makeFactLayer();
    (factLayer.getActive as ReturnType<typeof vi.fn>).mockResolvedValue([lowConfidenceFact]);

    mockExtractFacts.mockResolvedValue([
      { subject: 'auth-module', predicate: 'uses', object: 'JWT', source_episode_ids: [] },
      { subject: 'auth-module', predicate: 'implements', object: 'OAuth2', source_episode_ids: [] },
    ]);

    const redis = makeRedis();
    const neo4j = makeNeo4j({ fact: factLayer });
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-stale-3',
      agent_id: 'agent-1',
      task: 'update auth',
      content: 'Auth uses JWT and implements OAuth2',
    };

    await service.store(input);
    await flushAsync();

    // confidence is already at 0.1 — should not be decayed further
    expect(factLayer.updateConfidence).not.toHaveBeenCalled();
  });

  it('degrades gracefully when updateConfidence is not implemented', async () => {
    const factLayer = makeFactLayer();
    delete (factLayer as unknown as Record<string, unknown>).updateConfidence;
    (factLayer.getActive as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeFactNode({ id: 'fact-x', confidence: 0.8 }),
    ]);

    mockExtractFacts.mockResolvedValue([
      { subject: 'auth-module', predicate: 'uses', object: 'JWT', source_episode_ids: [] },
      { subject: 'auth-module', predicate: 'has', object: 'tokens', source_episode_ids: [] },
    ]);

    const redis = makeRedis();
    const neo4j = makeNeo4j({ fact: factLayer });
    const embedding = makeEmbedding();
    const service = new AMPService(redis, neo4j, embedding, makeConfig());

    const input: EpisodeInput = {
      session_id: 'sess-stale-4',
      agent_id: 'agent-1',
      task: 'test',
      content: 'Auth uses JWT and has tokens',
    };

    await service.store(input);
    await flushAsync();

    // Should not throw — facts still created
    expect(factLayer.create).toHaveBeenCalledTimes(2);
  });
});
