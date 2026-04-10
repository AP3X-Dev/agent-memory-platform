// packages/redis/src/__tests__/blocks.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRedisClient } from '../client.js';
import { BlockStore } from '../blocks.js';
import type { MemoryBlock } from '@amp/core';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function isRedisReachable(url: string): Promise<boolean> {
  const probe = createRedisClient(url, {
    maxRetriesPerRequest: 0,
    connectTimeout: 1000,
    retryStrategy: () => null,
  });
  try {
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    await probe.quit().catch(() => {});
  }
}

const TEST_SCOPE = `test-blocks-${Date.now()}`;

function makeBlock(overrides: Partial<MemoryBlock> = {}): MemoryBlock {
  const now = new Date().toISOString();
  return {
    id: 'block-1',
    name: 'persona',
    tier: 'core',
    content: 'You are a helpful assistant.',
    scope: TEST_SCOPE,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('BlockStore (Redis)', () => {
  const redis = createRedisClient(REDIS_URL);
  const store = new BlockStore(redis);
  let redisAvailable = false;

  beforeAll(async () => {
    redisAvailable = await isRedisReachable(REDIS_URL);
    if (!redisAvailable) {
      console.warn(`[skip] Redis not reachable at ${REDIS_URL} — skipping block store tests`);
    }
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    const keys = await redis.keys(`amp:block:${TEST_SCOPE}:*`);
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    if (redisAvailable) {
      const keys = await redis.keys(`amp:block:${TEST_SCOPE}:*`);
      if (keys.length) await redis.del(...keys);
    }
    await redis.quit().catch(() => {});
  });

  it('should return null for a missing block', async () => {
    if (!redisAvailable) return;
    const result = await store.get(TEST_SCOPE, 'nonexistent');
    expect(result).toBeNull();
  });

  it('should set and get a core block', async () => {
    if (!redisAvailable) return;
    const block = makeBlock();
    await store.set(block);
    const result = await store.get(TEST_SCOPE, 'persona');
    expect(result).toEqual(block);
  });

  it('should set a core block without TTL', async () => {
    if (!redisAvailable) return;
    const block = makeBlock();
    await store.set(block);
    const ttl = await redis.ttl(`amp:block:${TEST_SCOPE}:persona`);
    expect(ttl).toBe(-1); // no expiry
  });

  it('should set a working block with 24h TTL', async () => {
    if (!redisAvailable) return;
    const block = makeBlock({
      name: 'working_state',
      tier: 'working',
      session_id: 'sess-1',
    });
    await store.set(block);
    const ttl = await redis.ttl(`amp:block:${TEST_SCOPE}:sess-1:working_state`);
    expect(ttl).toBeGreaterThan(86300);
    expect(ttl).toBeLessThanOrEqual(86400);
  });

  it('should get a working block with session_id', async () => {
    if (!redisAvailable) return;
    const block = makeBlock({
      name: 'working_state',
      tier: 'working',
      session_id: 'sess-2',
      content: 'current progress',
    });
    await store.set(block);
    const result = await store.get(TEST_SCOPE, 'working_state', 'sess-2');
    expect(result).toEqual(block);
  });

  it('should list all blocks for a scope', async () => {
    if (!redisAvailable) return;
    await store.set(makeBlock({ id: 'b1', name: 'persona' }));
    await store.set(makeBlock({ id: 'b2', name: 'user' }));
    const blocks = await store.list(TEST_SCOPE);
    expect(blocks).toHaveLength(2);
    const names = blocks.map((b) => b.name).sort();
    expect(names).toEqual(['persona', 'user']);
  });

  it('should list blocks filtered by tier', async () => {
    if (!redisAvailable) return;
    await store.set(makeBlock({ id: 'b1', name: 'persona', tier: 'core' }));
    await store.set(makeBlock({ id: 'b2', name: 'working_state', tier: 'working' }));
    const coreBlocks = await store.list(TEST_SCOPE, 'core');
    expect(coreBlocks).toHaveLength(1);
    expect(coreBlocks[0].name).toBe('persona');
  });

  it('should list blocks filtered by session_id', async () => {
    if (!redisAvailable) return;
    await store.set(makeBlock({ id: 'b1', name: 'persona', tier: 'core' }));
    await store.set(makeBlock({
      id: 'b2',
      name: 'working_state',
      tier: 'working',
      session_id: 'sess-filter',
    }));
    const sessionBlocks = await store.list(TEST_SCOPE, undefined, 'sess-filter');
    expect(sessionBlocks).toHaveLength(1);
    expect(sessionBlocks[0].name).toBe('working_state');
  });

  it('should delete a block', async () => {
    if (!redisAvailable) return;
    const block = makeBlock();
    await store.set(block);
    await store.delete(TEST_SCOPE, 'persona');
    const result = await store.get(TEST_SCOPE, 'persona');
    expect(result).toBeNull();
  });

  it('should delete a working block with session_id', async () => {
    if (!redisAvailable) return;
    const block = makeBlock({
      name: 'working_state',
      tier: 'working',
      session_id: 'sess-del',
    });
    await store.set(block);
    await store.delete(TEST_SCOPE, 'working_state', 'sess-del');
    const result = await store.get(TEST_SCOPE, 'working_state', 'sess-del');
    expect(result).toBeNull();
  });

  it('should overwrite existing block on set', async () => {
    if (!redisAvailable) return;
    const block = makeBlock({ content: 'original' });
    await store.set(block);
    await store.set({ ...block, content: 'updated', updated_at: new Date().toISOString() });
    const result = await store.get(TEST_SCOPE, 'persona');
    expect(result?.content).toBe('updated');
  });

  it('should return null on corrupted JSON in get()', async () => {
    if (!redisAvailable) return;
    // Write corrupted data directly
    await redis.set(`amp:block:${TEST_SCOPE}:corrupted`, '{not valid json!!!');
    const result = await store.get(TEST_SCOPE, 'corrupted');
    expect(result).toBeNull();
  });

  it('should skip corrupted entries in list()', async () => {
    if (!redisAvailable) return;
    // Write a valid block
    await store.set(makeBlock({ id: 'valid-1', name: 'valid' }));
    // Write corrupted data directly
    await redis.set(`amp:block:${TEST_SCOPE}:corrupted`, 'not json at all');
    const blocks = await store.list(TEST_SCOPE);
    // Should only return the valid block, not crash
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    const names = blocks.map((b) => b.name);
    expect(names).toContain('valid');
  });

  it('should handle empty scope gracefully', async () => {
    if (!redisAvailable) return;
    const result = await store.get('', 'anything');
    expect(result).toBeNull();
    const blocks = await store.list('');
    expect(blocks).toEqual([]);
  });
});
