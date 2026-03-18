// packages/redis/src/__tests__/cache.test.ts
import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import { createRedisClient } from '../client.js';
import { ContextCache } from '../cache.js';

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

describe('ContextCache', () => {
  const redis = createRedisClient(REDIS_URL);
  const cache = new ContextCache(redis);
  let redisAvailable = false;

  beforeAll(async () => {
    redisAvailable = await isRedisReachable(REDIS_URL);
    if (!redisAvailable) {
      console.warn(`[skip] Redis not reachable at ${REDIS_URL} — skipping cache tests`);
    }
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    const keys = await redis.keys('amp:ctx:test-*');
    if (keys.length) await redis.del(...keys);
    const depKeys = await redis.keys('amp:deps:test-*');
    if (depKeys.length) await redis.del(...depKeys);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('should return null for cache miss', async () => {
    if (!redisAvailable) return;
    const result = await cache.get('nonexistent-scope-hash');
    expect(result).toBeNull();
  });

  it('should store and retrieve context', async () => {
    if (!redisAvailable) return;
    const context = {
      markdown: '# Memory\nSome content',
      tokens: 100,
      sources: ['test-node-1', 'test-node-2'],
      assembled_at: new Date().toISOString(),
    };
    await cache.set('test-scope-1', context, ['test-node-1', 'test-node-2'], 60);
    const result = await cache.get('test-scope-1');
    expect(result).toEqual(context);
  });

  it('should track dependencies for invalidation', async () => {
    if (!redisAvailable) return;
    const context = {
      markdown: '# Test',
      tokens: 50,
      sources: ['test-node-A'],
      assembled_at: new Date().toISOString(),
    };
    await cache.set('test-scope-2', context, ['test-node-A'], 60);

    const invalidated = await cache.invalidateByNodeId('test-node-A');
    expect(invalidated).toBeGreaterThan(0);

    const result = await cache.get('test-scope-2');
    expect(result).toBeNull();
  });

  it('should return 0 when invalidating a node with no dependencies', async () => {
    if (!redisAvailable) return;
    const invalidated = await cache.invalidateByNodeId('test-node-nonexistent');
    expect(invalidated).toBe(0);
  });

  it('should invalidate multiple caches sharing the same source node', async () => {
    if (!redisAvailable) return;
    const contextA = {
      markdown: '# Context A',
      tokens: 10,
      sources: ['test-node-shared'],
      assembled_at: new Date().toISOString(),
    };
    const contextB = {
      markdown: '# Context B',
      tokens: 20,
      sources: ['test-node-shared'],
      assembled_at: new Date().toISOString(),
    };

    await cache.set('test-scope-3', contextA, ['test-node-shared'], 60);
    await cache.set('test-scope-4', contextB, ['test-node-shared'], 60);

    const invalidated = await cache.invalidateByNodeId('test-node-shared');
    expect(invalidated).toBe(2);

    expect(await cache.get('test-scope-3')).toBeNull();
    expect(await cache.get('test-scope-4')).toBeNull();
  });
});
