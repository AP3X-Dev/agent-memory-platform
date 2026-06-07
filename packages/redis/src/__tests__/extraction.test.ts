// packages/redis/src/__tests__/extraction.test.ts
//
// Round-trip tests against a real Redis (skipped when Redis is unreachable, e.g.
// local dev without infra; runs in the CI integration job).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRedisClient } from '../client.js';
import {
  ExtractionQueue,
  EXTRACTION_STREAM,
  EXTRACTION_DLQ,
  EXTRACTION_GROUP,
} from '../extraction.js';

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

describe('ExtractionQueue', () => {
  const redis = createRedisClient(REDIS_URL);
  const queue = new ExtractionQueue(redis);
  let redisAvailable = false;

  beforeAll(async () => {
    redisAvailable = await isRedisReachable(REDIS_URL);
    if (!redisAvailable) console.warn(`[skip] Redis not reachable at ${REDIS_URL} — skipping ExtractionQueue tests`);
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    await redis.del(EXTRACTION_STREAM, EXTRACTION_DLQ);
    // Drop the group so each test starts clean (ignore if it doesn't exist).
    await redis.xgroup('DESTROY', EXTRACTION_STREAM, EXTRACTION_GROUP).catch(() => {});
  });

  afterAll(async () => {
    await redis.del(EXTRACTION_STREAM, EXTRACTION_DLQ).catch(() => {});
    await redis.quit().catch(() => {});
  });

  it('enqueues and reads a job round-trip with fields intact', async () => {
    if (!redisAvailable) return;
    await queue.ensureGroup();
    await queue.enqueue({ episodeId: 'ep-1', content: 'auth uses JWT' });

    const jobs = await queue.read('c1', 10);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ episodeId: 'ep-1', content: 'auth uses JWT', attempt: 0 });
    expect(jobs[0].id).toBeTruthy();
  });

  it('ack removes the job from the stream and clears pending', async () => {
    if (!redisAvailable) return;
    await queue.ensureGroup();
    await queue.enqueue({ episodeId: 'ep-2', content: 'x' });
    const [job] = await queue.read('c1', 10);
    await queue.ack(job.id);

    const stats = await queue.stats();
    expect(stats.pending).toBe(0);
    expect(stats.inflight).toBe(0);
  });

  it('dead-letters and replays jobs', async () => {
    if (!redisAvailable) return;
    await queue.ensureGroup();
    await queue.enqueue({ episodeId: 'ep-3', content: 'fails' });
    const [job] = await queue.read('c1', 10);
    await queue.deadLetter(job, 'boom');
    await queue.ack(job.id);

    let stats = await queue.stats();
    expect(stats.deadLettered).toBe(1);

    const moved = await queue.replayDeadLetters();
    expect(moved).toBe(1);
    stats = await queue.stats();
    expect(stats.deadLettered).toBe(0);
    expect(stats.pending).toBe(1);
  });
});
