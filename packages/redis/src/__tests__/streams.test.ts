// packages/redis/src/__tests__/streams.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRedisClient } from '../client.js';
import { SignalStream, EpisodicBuffer } from '../streams.js';
import type { BufferEvent } from '../streams.js';
import type { StreamSignal } from '@amp/core';

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

describe('SignalStream', () => {
  const redis = createRedisClient(REDIS_URL);
  const stream = new SignalStream(redis);
  let redisAvailable = false;

  beforeAll(async () => {
    redisAvailable = await isRedisReachable(REDIS_URL);
    if (!redisAvailable) {
      console.warn(`[skip] Redis not reachable at ${REDIS_URL} — skipping SignalStream tests`);
    }
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    // Clean up the test stream before each test
    await redis.del('amp:signals');
  });

  afterAll(async () => {
    await redis.quit().catch(() => {});
  });

  it('should publish a signal and return a message ID', async () => {
    if (!redisAvailable) return;

    const signal: StreamSignal = {
      type: 'reinforcement',
      target_id: 'node-001',
      detail: 'Great answer',
      source_session: 'session-abc',
      agent_id: 'agent-1',
      timestamp: new Date().toISOString(),
    };

    const msgId = await stream.publish(signal);
    expect(typeof msgId).toBe('string');
    expect(msgId.length).toBeGreaterThan(0);
    // Redis stream IDs look like "1234567890-0"
    expect(msgId).toMatch(/^\d+-\d+$/);
  });

  it('should consume a published signal', async () => {
    if (!redisAvailable) return;

    // Create the stream first so XGROUP CREATE with '$' captures nothing,
    // then we publish after creating the group with '0' to read from start.
    const signal: StreamSignal = {
      type: 'correction',
      target_id: 'node-002',
      detail: 'Needs revision',
      source_session: 'session-xyz',
      agent_id: 'agent-2',
      timestamp: new Date().toISOString(),
    };

    const msgId = await stream.publish(signal);

    // Consume with startId='0' to read all pending including just-published
    const consumed = await stream.consume('test-group', 'consumer-1', 10, '0');

    expect(consumed.length).toBeGreaterThanOrEqual(1);
    const found = consumed.find((s) => s.target_id === 'node-002');
    expect(found).toBeDefined();
    expect(found!.type).toBe('correction');
    expect(found!.detail).toBe('Needs revision');
    expect(found!.source_session).toBe('session-xyz');
    expect(found!.agent_id).toBe('agent-2');
    expect(msgId).toMatch(/^\d+-\d+$/);
  });

  it('should not return already-consumed messages on subsequent consume calls', async () => {
    if (!redisAvailable) return;

    const signal: StreamSignal = {
      type: 'contradiction',
      target_id: 'node-003',
      detail: 'Conflicts with prior answer',
      source_session: 'session-dup',
      agent_id: 'agent-3',
      timestamp: new Date().toISOString(),
    };

    await stream.publish(signal);

    // First consume reads from beginning
    const first = await stream.consume('dedup-group', 'consumer-1', 10, '0');
    expect(first.length).toBe(1);

    // Second consume with '>' should return nothing (already ACKed)
    const second = await stream.consume('dedup-group', 'consumer-1', 10, '>');
    expect(second.length).toBe(0);
  });
});

describe('EpisodicBuffer', () => {
  const redis = createRedisClient(REDIS_URL);
  const buffer = new EpisodicBuffer(redis);
  let redisAvailable = false;

  beforeAll(async () => {
    redisAvailable = await isRedisReachable(REDIS_URL);
    if (!redisAvailable) {
      console.warn(`[skip] Redis not reachable at ${REDIS_URL} — skipping EpisodicBuffer tests`);
    }
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    await redis.del('amp:episodic-buffer');
  });

  afterAll(async () => {
    await redis.quit().catch(() => {});
  });

  it('should add an event and return a message ID', async () => {
    if (!redisAvailable) return;

    const event: BufferEvent = { event_type: 'tool_call', content: 'Called search tool' };
    const msgId = await buffer.add('session-A', event);
    expect(typeof msgId).toBe('string');
    expect(msgId).toMatch(/^\d+-\d+$/);
  });

  it('should flush events for the correct session only', async () => {
    if (!redisAvailable) return;

    await buffer.add('session-A', { event_type: 'tool_call', content: 'Called search' });
    await buffer.add('session-A', { event_type: 'response', content: 'Got result' });
    await buffer.add('session-B', { event_type: 'tool_call', content: 'Different session' });

    const flushed = await buffer.flush('session-A');

    expect(flushed).toHaveLength(2);
    expect(flushed[0].event_type).toBe('tool_call');
    expect(flushed[0].content).toBe('Called search');
    expect(flushed[1].event_type).toBe('response');
    expect(flushed[1].content).toBe('Got result');

    // session-B event should still be in the stream
    const remaining = await buffer.flush('session-B');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].content).toBe('Different session');
  });

  it('should return empty array when no events exist for session', async () => {
    if (!redisAvailable) return;

    const flushed = await buffer.flush('session-nonexistent');
    expect(flushed).toEqual([]);
  });

  it('should remove flushed events so a second flush returns nothing', async () => {
    if (!redisAvailable) return;

    await buffer.add('session-C', { event_type: 'ping', content: 'hello' });

    const first = await buffer.flush('session-C');
    expect(first).toHaveLength(1);

    const second = await buffer.flush('session-C');
    expect(second).toHaveLength(0);
  });
});
