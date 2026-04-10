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
});

// ─── Real-time fact extraction in store ─────────────────────────────────────

function makeFactLayer(): FactLayer {
  return {
    getActive: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue('fact-1'),
    findBySubjectPredicate: vi.fn().mockResolvedValue([]),
    invalidate: vi.fn().mockResolvedValue(undefined),
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
    expect(mockExtractFacts).toHaveBeenCalledWith(input.content, 'test-key');
    expect(factLayer.findBySubjectPredicate).toHaveBeenCalledWith('auth-module', 'uses');
    expect(factLayer.create).toHaveBeenCalledOnce();
    // Verify the created fact
    const createdFact = (factLayer.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as FactNode;
    expect(createdFact.subject).toBe('auth-module');
    expect(createdFact.predicate).toBe('uses');
    expect(createdFact.object).toBe('JWT');
    expect(createdFact.status).toBe('active');
    expect(createdFact.source_episode_ids).toEqual([result.id]);
    expect(createdFact.confidence).toBe(0.5);
    expect(createdFact.supersedes_fact_id).toBeNull();
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
