// packages/redis/src/__tests__/locks.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRedisClient } from '../client.js';
import { DistributedLock } from '../locks.js';

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

describe('DistributedLock', () => {
  const redis = createRedisClient(REDIS_URL);
  const lock = new DistributedLock(redis);
  let redisAvailable = false;

  beforeAll(async () => {
    redisAvailable = await isRedisReachable(REDIS_URL);
    if (!redisAvailable) {
      console.warn(`[skip] Redis not reachable at ${REDIS_URL} — skipping lock tests`);
    }
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    const keys = await redis.keys('amp:lock:consolidate:test-*');
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    await redis.quit().catch(() => {});
  });

  it('should acquire a lock successfully', async () => {
    if (!redisAvailable) return;
    const acquired = await lock.acquire('test-scope-1', 'worker-A', 30);
    expect(acquired).toBe(true);
  });

  it('should reject a second acquisition on the same scope', async () => {
    if (!redisAvailable) return;
    await lock.acquire('test-scope-2', 'worker-A', 30);
    const second = await lock.acquire('test-scope-2', 'worker-B', 30);
    expect(second).toBe(false);
  });

  it('should set a TTL on the lock key', async () => {
    if (!redisAvailable) return;
    await lock.acquire('test-scope-3', 'worker-A', 60);
    const ttl = await redis.ttl('amp:lock:consolidate:test-scope-3');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('should release a lock held by the correct holder', async () => {
    if (!redisAvailable) return;
    await lock.acquire('test-scope-4', 'worker-A', 30);
    const released = await lock.release('test-scope-4', 'worker-A');
    expect(released).toBe(true);

    // Lock should be gone
    const reacquired = await lock.acquire('test-scope-4', 'worker-B', 30);
    expect(reacquired).toBe(true);
  });

  it('should not release a lock held by a different holder', async () => {
    if (!redisAvailable) return;
    await lock.acquire('test-scope-5', 'worker-A', 30);
    const released = await lock.release('test-scope-5', 'worker-B');
    expect(released).toBe(false);

    // Original lock should still exist
    const raw = await redis.get('amp:lock:consolidate:test-scope-5');
    expect(raw).toBe('worker-A');
  });

  it('should return false when releasing a non-existent lock', async () => {
    if (!redisAvailable) return;
    const released = await lock.release('test-scope-nonexistent', 'worker-A');
    expect(released).toBe(false);
  });

  it('should allow reacquisition after release', async () => {
    if (!redisAvailable) return;
    await lock.acquire('test-scope-6', 'worker-A', 30);
    await lock.release('test-scope-6', 'worker-A');
    const reacquired = await lock.acquire('test-scope-6', 'worker-C', 30);
    expect(reacquired).toBe(true);
  });
});
