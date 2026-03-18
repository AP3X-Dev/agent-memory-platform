// packages/redis/src/__tests__/session.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRedisClient } from '../client.js';
import { SessionStore } from '../session.js';
import type { SessionState } from '@amp/core';

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

describe('SessionStore', () => {
  const redis = createRedisClient(REDIS_URL);
  const store = new SessionStore(redis);
  let redisAvailable = false;

  const testSession: SessionState = {
    agent_id: 'agent-test-1',
    task: 'test task',
    stage: 'load',
    loaded_memories: ['mem-1', 'mem-2'],
    pending_signals: [
      { type: 'reinforcement', target_id: 'node-1', detail: 'looks good' },
    ],
  };

  beforeAll(async () => {
    redisAvailable = await isRedisReachable(REDIS_URL);
    if (!redisAvailable) {
      console.warn(`[skip] Redis not reachable at ${REDIS_URL} — skipping session tests`);
    }
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    const keys = await redis.keys('amp:session:test-*');
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    await redis.quit().catch(() => {});
  });

  it('should return null for a missing session', async () => {
    if (!redisAvailable) return;
    const result = await store.get('test-nonexistent');
    expect(result).toBeNull();
  });

  it('should set and get a session', async () => {
    if (!redisAvailable) return;
    await store.set('test-session-1', testSession);
    const result = await store.get('test-session-1');
    expect(result).toEqual(testSession);
  });

  it('should delete a session', async () => {
    if (!redisAvailable) return;
    await store.set('test-session-2', testSession);
    await store.delete('test-session-2');
    const result = await store.get('test-session-2');
    expect(result).toBeNull();
  });

  it('should refresh the TTL on an existing session', async () => {
    if (!redisAvailable) return;
    await store.set('test-session-3', testSession);
    await store.refresh('test-session-3');
    const ttl = await redis.ttl('amp:session:test-session-3');
    expect(ttl).toBeGreaterThan(3590);
  });

  it('should store and round-trip arrays correctly', async () => {
    if (!redisAvailable) return;
    const state: SessionState = {
      ...testSession,
      loaded_memories: [],
      pending_signals: [],
    };
    await store.set('test-session-4', state);
    const result = await store.get('test-session-4');
    expect(result?.loaded_memories).toEqual([]);
    expect(result?.pending_signals).toEqual([]);
  });

  it('should set a TTL on creation', async () => {
    if (!redisAvailable) return;
    await store.set('test-session-5', testSession);
    const ttl = await redis.ttl('amp:session:test-session-5');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(3600);
  });
});
