// packages/redis/src/__tests__/client.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createRedisClient, healthCheck } from '../client.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Probe whether Redis is reachable before running connection tests
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

describe('Redis Client', () => {
  let redisAvailable = false;
  const client = createRedisClient(REDIS_URL);

  beforeAll(async () => {
    redisAvailable = await isRedisReachable(REDIS_URL);
    if (!redisAvailable) {
      console.warn(`[skip] Redis not reachable at ${REDIS_URL} — skipping connection tests`);
    }
  });

  afterAll(async () => {
    await client.quit().catch(() => {});
  });

  it('should connect and respond to ping', async () => {
    if (!redisAvailable) return;
    const result = await client.ping();
    expect(result).toBe('PONG');
  });

  it('should report healthy when connected', async () => {
    if (!redisAvailable) return;
    const health = await healthCheck(client);
    expect(health.status).toBe('healthy');
    expect(health.latencyMs).toBeLessThan(100);
  });

  it('should report unhealthy for bad connection', async () => {
    const badClient = createRedisClient('redis://localhost:19999', {
      maxRetriesPerRequest: 0,
      connectTimeout: 500,
      retryStrategy: () => null,
    });
    const health = await healthCheck(badClient);
    expect(health.status).toBe('unhealthy');
    await badClient.quit().catch(() => {});
  });
});
