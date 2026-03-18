// packages/redis/src/__tests__/embeddings.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRedisClient } from '../client.js';
import { EmbeddingCache } from '../embeddings.js';

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

describe('EmbeddingCache', () => {
  const redis = createRedisClient(REDIS_URL);
  const cache = new EmbeddingCache(redis);
  let redisAvailable = false;

  const TEST_CONTENT = 'test embedding content for unit tests';
  const TEST_EMBEDDING = [0.1, 0.2, 0.3, -0.4, 0.5];

  beforeAll(async () => {
    redisAvailable = await isRedisReachable(REDIS_URL);
    if (!redisAvailable) {
      console.warn(`[skip] Redis not reachable at ${REDIS_URL} — skipping embedding cache tests`);
    }
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    const keys = await redis.keys('amp:emb:*');
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('should return null for a cache miss', async () => {
    if (!redisAvailable) return;
    const result = await cache.get('content that has never been stored');
    expect(result).toBeNull();
  });

  it('should store and retrieve an embedding', async () => {
    if (!redisAvailable) return;
    await cache.set(TEST_CONTENT, TEST_EMBEDDING);
    const result = await cache.get(TEST_CONTENT);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(TEST_EMBEDDING.length);
    // Float32 precision: compare with tolerance
    for (let i = 0; i < TEST_EMBEDDING.length; i++) {
      expect(result![i]).toBeCloseTo(TEST_EMBEDDING[i], 5);
    }
  });

  it('should use content-based hashing so identical content maps to the same key', async () => {
    if (!redisAvailable) return;
    await cache.set(TEST_CONTENT, TEST_EMBEDDING);
    // Retrieve using the exact same string — must hit
    const result = await cache.get(TEST_CONTENT);
    expect(result).not.toBeNull();
  });

  it('should treat different content as different cache entries', async () => {
    if (!redisAvailable) return;
    await cache.set('content A', [1.0, 2.0]);
    const miss = await cache.get('content B');
    expect(miss).toBeNull();
  });

  it('should store large embeddings (1536 dimensions) efficiently', async () => {
    if (!redisAvailable) return;
    const large = Array.from({ length: 1536 }, (_, i) => Math.sin(i));
    await cache.set('large embedding test', large);
    const result = await cache.get('large embedding test');
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1536);
    for (let i = 0; i < large.length; i++) {
      expect(result![i]).toBeCloseTo(large[i], 5);
    }
  });

  it('should respect a custom TTL', async () => {
    if (!redisAvailable) return;
    await cache.set(TEST_CONTENT, TEST_EMBEDDING, 3600);
    const ttl = await redis.ttl('amp:emb:' + (await redis.keys('amp:emb:*')).map(k => k.split(':')[2])[0]);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(3600);
  });
});
