// packages/core/src/__tests__/blocks.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryBlockService, MAX_BLOCK_SIZE } from '../blocks.js';
import type { RedisBlockLayer, Neo4jBlockLayer } from '../blocks.js';
import type { MemoryBlock } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBlock(overrides: Partial<MemoryBlock> = {}): MemoryBlock {
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

// ─── Mock factories ────────────────────────────────────────────────────────────

function makeRedis(overrides: Partial<RedisBlockLayer> = {}): RedisBlockLayer {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeNeo4j(overrides: Partial<Neo4jBlockLayer> = {}): Neo4jBlockLayer {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MemoryBlockService.read', () => {
  it('returns block from Redis cache hit', async () => {
    const block = makeBlock();
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(block) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.read('project:test', 'persona');
    expect(result).toBe(block);
    expect(redis.get).toHaveBeenCalledWith('project:test', 'persona', undefined);
    expect(neo4j.get).not.toHaveBeenCalled();
  });

  it('falls back to Neo4j on Redis miss', async () => {
    const block = makeBlock();
    const redis = makeRedis();
    const neo4j = makeNeo4j({ get: vi.fn().mockResolvedValue(block) });
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.read('project:test', 'persona');
    expect(result).toBe(block);
    expect(neo4j.get).toHaveBeenCalledWith('project:test', 'persona', undefined);
  });

  it('returns null when block not found in either store', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.read('project:test', 'nonexistent');
    expect(result).toBeNull();
  });

  it('passes session_id to Redis', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    await service.read('project:test', 'working_state', 'sess-1');
    expect(redis.get).toHaveBeenCalledWith('project:test', 'working_state', 'sess-1');
  });
});

describe('MemoryBlockService.insert', () => {
  it('appends to existing block', async () => {
    const existing = makeBlock({ content: 'Hello' });
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(existing) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.insert('project:test', 'persona', ' World');
    expect(result.content).toBe('Hello World');
    expect(redis.set).toHaveBeenCalledOnce();
    // Core tier → also saved to Neo4j
    expect(neo4j.save).toHaveBeenCalledOnce();
  });

  it('creates new block if not found', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.insert('project:test', 'persona', 'New content');
    expect(result.content).toBe('New content');
    expect(result.name).toBe('persona');
    expect(result.tier).toBe('core'); // persona is a core default
    expect(result.id).toBeTruthy();
    expect(redis.set).toHaveBeenCalledOnce();
    expect(neo4j.save).toHaveBeenCalledOnce(); // core tier
  });

  it('creates working block for unknown name', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.insert('project:test', 'custom_block', 'data');
    expect(result.tier).toBe('working');
    expect(redis.set).toHaveBeenCalledOnce();
    expect(neo4j.save).not.toHaveBeenCalled(); // working tier → no Neo4j
  });

  it('sets session_id on new working block', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.insert('project:test', 'custom', 'data', 'sess-1');
    expect(result.session_id).toBe('sess-1');
  });
});

describe('MemoryBlockService.replace', () => {
  it('replaces old text with new text', async () => {
    const block = makeBlock({ content: 'Hello World' });
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(block) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.replace('project:test', 'persona', 'World', 'Universe');
    expect(result.content).toBe('Hello Universe');
  });

  it('throws when block not found', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    await expect(
      service.replace('project:test', 'nonexistent', 'old', 'new'),
    ).rejects.toThrow('Block "nonexistent" not found');
  });

  it('throws when old text not found in block', async () => {
    const block = makeBlock({ content: 'Hello World' });
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(block) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    await expect(
      service.replace('project:test', 'persona', 'nonexistent text', 'new'),
    ).rejects.toThrow('old_text not found');
  });
});

describe('MemoryBlockService.rewrite', () => {
  it('overwrites existing block content', async () => {
    const block = makeBlock({ content: 'old content' });
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(block) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.rewrite('project:test', 'persona', 'completely new');
    expect(result.content).toBe('completely new');
    expect(result.id).toBe(block.id); // same block, updated
  });

  it('creates new block if not found', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.rewrite('project:test', 'persona', 'fresh start');
    expect(result.content).toBe('fresh start');
    expect(result.tier).toBe('core');
    expect(result.id).toBeTruthy();
  });
});

describe('MemoryBlockService.promote', () => {
  it('changes tier and persists to Neo4j on promote to core', async () => {
    const block = makeBlock({ tier: 'working' });
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(block) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.promote('project:test', 'persona', 'working', 'core');
    expect(result.tier).toBe('core');
    expect(redis.set).toHaveBeenCalledOnce();
    expect(neo4j.save).toHaveBeenCalledOnce();
  });

  it('deletes the stale session-scoped copy when promoting to core', async () => {
    // working block keyed by session id; promoting to core strips session_id (new key),
    // so the old session-scoped Redis entry must be removed or it lingers as stale.
    const block = makeBlock({ tier: 'working', session_id: 'sess-1' });
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(block) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.promote('project:test', 'working_state', 'working', 'core', 'sess-1');
    expect(result.tier).toBe('core');
    expect(result.session_id).toBeUndefined();
    expect(redis.delete).toHaveBeenCalledWith('project:test', 'working_state', 'sess-1');
  });

  it('throws when block not found', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    await expect(
      service.promote('project:test', 'nonexistent', 'working', 'core'),
    ).rejects.toThrow('Block "nonexistent" not found');
  });

  it('throws when current tier does not match fromTier', async () => {
    const block = makeBlock({ tier: 'core' });
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(block) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    await expect(
      service.promote('project:test', 'persona', 'working', 'archive'),
    ).rejects.toThrow('Block "persona" is tier "core", expected "working"');
  });

  it('does not persist to Neo4j when promoting to working', async () => {
    const block = makeBlock({ tier: 'archive' });
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(block) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    await service.promote('project:test', 'persona', 'archive', 'working');
    expect(redis.set).toHaveBeenCalledOnce();
    expect(neo4j.save).not.toHaveBeenCalled();
  });
});

describe('MemoryBlockService.archive', () => {
  it('returns content and deletes from both stores', async () => {
    const block = makeBlock({ content: 'important data' });
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(block) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const content = await service.archive('project:test', 'persona');
    expect(content).toBe('important data');
    expect(redis.delete).toHaveBeenCalledWith('project:test', 'persona', undefined);
    expect(neo4j.delete).toHaveBeenCalledWith('project:test', 'persona', undefined);
  });

  it('throws when block not found', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    await expect(
      service.archive('project:test', 'nonexistent'),
    ).rejects.toThrow('Block "nonexistent" not found');
  });
});

describe('MemoryBlockService.listBlocks', () => {
  it('combines Redis and Neo4j results, Redis wins on conflict', async () => {
    const redisBlock = makeBlock({ name: 'shared', content: 'redis version' });
    const neo4jBlock = makeBlock({ name: 'shared', content: 'neo4j version' });
    const neo4jOnly = makeBlock({ name: 'neo4j-only', content: 'only in neo4j' });

    const redis = makeRedis({ list: vi.fn().mockResolvedValue([redisBlock]) });
    const neo4j = makeNeo4j({ list: vi.fn().mockResolvedValue([neo4jBlock, neo4jOnly]) });
    const service = new MemoryBlockService(redis, neo4j);

    const blocks = await service.listBlocks('project:test');
    expect(blocks).toHaveLength(2);

    const shared = blocks.find((b) => b.name === 'shared');
    expect(shared?.content).toBe('redis version'); // Redis wins

    const only = blocks.find((b) => b.name === 'neo4j-only');
    expect(only?.content).toBe('only in neo4j');
  });

  it('passes tier and session_id filters', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    await service.listBlocks('project:test', 'core', 'sess-1');
    expect(redis.list).toHaveBeenCalledWith('project:test', 'core', 'sess-1');
    expect(neo4j.list).toHaveBeenCalledWith('project:test', 'core', 'sess-1');
  });
});

describe('MemoryBlockService.initDefaults', () => {
  it('creates default blocks that do not exist', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const created = await service.initDefaults('project:test');
    expect(created.length).toBe(6); // all 6 DEFAULT_BLOCKS
    expect(redis.set).toHaveBeenCalledTimes(6);
    // Core blocks should also persist to Neo4j (4 core + 0 working in Neo4j)
    const neo4jCalls = vi.mocked(neo4j.save).mock.calls.length;
    expect(neo4jCalls).toBe(4); // persona, user, current_objective, project_state
  });

  it('skips blocks that already exist', async () => {
    const existingBlock = makeBlock({ name: 'persona' });
    const redis = makeRedis({
      get: vi.fn().mockImplementation((_scope: string, name: string) => {
        if (name === 'persona') return Promise.resolve(existingBlock);
        return Promise.resolve(null);
      }),
    });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const created = await service.initDefaults('project:test');
    expect(created.length).toBe(5); // 6 - 1 existing
    const names = created.map((b) => b.name);
    expect(names).not.toContain('persona');
  });
});

describe('MemoryBlockService.promote with sessionId', () => {
  it('finds session-scoped block when sessionId is provided', async () => {
    const block = makeBlock({ tier: 'working', session_id: 'sess-promo' });
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(block) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.promote('project:test', 'persona', 'working', 'core', 'sess-promo');
    expect(result.tier).toBe('core');
    expect(redis.get).toHaveBeenCalledWith('project:test', 'persona', 'sess-promo');
  });

  it('strips session_id when promoting to core', async () => {
    const block = makeBlock({ tier: 'working', session_id: 'sess-strip' });
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(block) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.promote('project:test', 'persona', 'working', 'core', 'sess-strip');
    expect(result.tier).toBe('core');
    expect(result.session_id).toBeUndefined();
    // Verify the block saved to Neo4j also has no session_id
    const savedBlock = vi.mocked(neo4j.save).mock.calls[0][0];
    expect(savedBlock.session_id).toBeUndefined();
  });

  it('preserves session_id when promoting to working', async () => {
    const block = makeBlock({ tier: 'archive', session_id: 'sess-keep' });
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(block) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.promote('project:test', 'persona', 'archive', 'working', 'sess-keep');
    expect(result.tier).toBe('working');
    expect(result.session_id).toBe('sess-keep');
  });
});

describe('MemoryBlockService.replace replaces all occurrences', () => {
  it('replaces all occurrences of old text, not just the first', async () => {
    const block = makeBlock({ content: 'foo bar foo baz foo' });
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(block) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.replace('project:test', 'persona', 'foo', 'qux');
    expect(result.content).toBe('qux bar qux baz qux');
  });
});

describe('MemoryBlockService content size limit', () => {
  it('throws on insert when appending would exceed max size', async () => {
    const existing = makeBlock({ content: 'x'.repeat(MAX_BLOCK_SIZE - 5) });
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(existing) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    await expect(
      service.insert('project:test', 'persona', 'x'.repeat(10)),
    ).rejects.toThrow('would exceed max size');
  });

  it('throws on insert for new block exceeding max size', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    await expect(
      service.insert('project:test', 'custom', 'x'.repeat(MAX_BLOCK_SIZE + 1)),
    ).rejects.toThrow('would exceed max size');
  });

  it('throws on rewrite exceeding max size', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    await expect(
      service.rewrite('project:test', 'persona', 'x'.repeat(MAX_BLOCK_SIZE + 1)),
    ).rejects.toThrow('would exceed max size');
  });

  it('throws on replace when result would exceed max size', async () => {
    const block = makeBlock({ content: 'a'.repeat(MAX_BLOCK_SIZE - 1) });
    const redis = makeRedis({ get: vi.fn().mockResolvedValue(block) });
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    await expect(
      service.replace('project:test', 'persona', 'a', 'bbb'),
    ).rejects.toThrow('would exceed max size');
  });

  it('allows content exactly at max size', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.insert('project:test', 'custom', 'x'.repeat(MAX_BLOCK_SIZE));
    expect(result.content.length).toBe(MAX_BLOCK_SIZE);
  });
});

describe('MemoryBlockService.read caches Neo4j fallback in Redis', () => {
  it('writes block to Redis after Neo4j cache miss', async () => {
    const block = makeBlock();
    const redis = makeRedis();
    const neo4j = makeNeo4j({ get: vi.fn().mockResolvedValue(block) });
    const service = new MemoryBlockService(redis, neo4j);

    const result = await service.read('project:test', 'persona');
    expect(result).toBe(block);
    expect(redis.set).toHaveBeenCalledWith(block);
  });

  it('does not write to Redis when block not found in either store', async () => {
    const redis = makeRedis();
    const neo4j = makeNeo4j();
    const service = new MemoryBlockService(redis, neo4j);

    await service.read('project:test', 'nonexistent');
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('does not crash if Redis cache-aside write fails', async () => {
    const block = makeBlock();
    const redis = makeRedis({ set: vi.fn().mockRejectedValue(new Error('Redis down')) });
    const neo4j = makeNeo4j({ get: vi.fn().mockResolvedValue(block) });
    const service = new MemoryBlockService(redis, neo4j);

    // Should not throw — just logs a warning
    const result = await service.read('project:test', 'persona');
    expect(result).toBe(block);
  });
});
