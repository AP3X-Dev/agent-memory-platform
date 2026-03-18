// packages/redis/src/__tests__/queue.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRedisClient } from '../client.js';
import { ConsolidationQueue } from '../queue.js';

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

describe('ConsolidationQueue', () => {
  const redis = createRedisClient(REDIS_URL);
  const queue = new ConsolidationQueue(redis);
  let redisAvailable = false;

  beforeAll(async () => {
    redisAvailable = await isRedisReachable(REDIS_URL);
    if (!redisAvailable) {
      console.warn(`[skip] Redis not reachable at ${REDIS_URL} — skipping queue tests`);
    }
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    await redis.del('amp:consolidation-queue');
  });

  afterAll(async () => {
    await redis.quit().catch(() => {});
  });

  it('should return null when queue is empty', async () => {
    if (!redisAvailable) return;
    const result = await queue.popHighest();
    expect(result).toBeNull();
  });

  it('should increment score for a member', async () => {
    if (!redisAvailable) return;
    const score = await queue.incrementScore('scope-A', 5);
    expect(score).toBe(5);
  });

  it('should accumulate score across multiple increments', async () => {
    if (!redisAvailable) return;
    await queue.incrementScore('scope-B', 3);
    const score = await queue.incrementScore('scope-B', 2);
    expect(score).toBe(5);
  });

  it('should pop the highest scoring member', async () => {
    if (!redisAvailable) return;
    await queue.incrementScore('scope-low', 1);
    await queue.incrementScore('scope-high', 10);
    await queue.incrementScore('scope-mid', 5);

    const result = await queue.popHighest();
    expect(result).not.toBeNull();
    expect(result!.member).toBe('scope-high');
    expect(result!.score).toBe(10);
  });

  it('should remove the member after popping', async () => {
    if (!redisAvailable) return;
    await queue.incrementScore('scope-X', 7);
    await queue.popHighest();
    const entries = await queue.peek();
    expect(entries.find((e) => e.member === 'scope-X')).toBeUndefined();
  });

  it('should peek without removing', async () => {
    if (!redisAvailable) return;
    await queue.incrementScore('scope-1', 10);
    await queue.incrementScore('scope-2', 5);

    const entries = await queue.peek(5);
    expect(entries).toHaveLength(2);
    expect(entries[0].member).toBe('scope-1');
    expect(entries[0].score).toBe(10);
    expect(entries[1].member).toBe('scope-2');
    expect(entries[1].score).toBe(5);

    // Verify nothing was removed
    const again = await queue.peek(5);
    expect(again).toHaveLength(2);
  });

  it('should respect the count limit in peek', async () => {
    if (!redisAvailable) return;
    await queue.incrementScore('scope-a', 10);
    await queue.incrementScore('scope-b', 8);
    await queue.incrementScore('scope-c', 6);

    const entries = await queue.peek(2);
    expect(entries).toHaveLength(2);
  });

  it('should return empty array when peeking empty queue', async () => {
    if (!redisAvailable) return;
    const entries = await queue.peek();
    expect(entries).toEqual([]);
  });
});
