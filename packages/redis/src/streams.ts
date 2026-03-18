// packages/redis/src/streams.ts
import type Redis from 'ioredis';
import type { StreamSignal } from '@amp/core';

export interface BufferEvent {
  event_type: string;
  content: string;
}

const SIGNALS_STREAM = 'amp:signals';
const EPISODIC_BUFFER_STREAM = 'amp:episodic-buffer';

/** Parse a flat [key, value, key, value, ...] array into a plain object. */
function parseFields(fields: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    obj[fields[i]] = fields[i + 1];
  }
  return obj;
}

export class SignalStream {
  constructor(private redis: Redis) {}

  /**
   * Publish a signal to the amp:signals Redis Stream.
   * Returns the XADD message ID.
   */
  async publish(signal: StreamSignal): Promise<string> {
    const id = await this.redis.xadd(
      SIGNALS_STREAM,
      '*',
      'type', signal.type,
      'target_id', signal.target_id,
      'detail', signal.detail,
      'source_session', signal.source_session,
      'agent_id', signal.agent_id,
      'timestamp', signal.timestamp,
    );
    if (!id) throw new Error('XADD returned null');
    return id;
  }

  /**
   * Consume signals from the amp:signals stream using a consumer group.
   * Auto-ACKs each message after reading.
   *
   * @param group    Consumer group name
   * @param consumer Consumer name
   * @param count    Max messages to read
   * @param startId  Stream ID to start from (default '>' = new messages)
   */
  async consume(
    group: string,
    consumer: string,
    count: number,
    startId: string = '>',
  ): Promise<StreamSignal[]> {
    // Ensure consumer group exists; ignore BUSYGROUP if already created
    try {
      await this.redis.xgroup('CREATE', SIGNALS_STREAM, group, '$', 'MKSTREAM');
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        !err.message.startsWith('BUSYGROUP')
      ) {
        throw err;
      }
    }

    const results = await this.redis.xreadgroup(
      'GROUP', group, consumer,
      'COUNT', count,
      'STREAMS', SIGNALS_STREAM, startId,
    ) as [string, [string, string[]][]][] | null;

    if (!results || results.length === 0) return [];

    const signals: StreamSignal[] = [];
    const [, messages] = results[0];

    for (const [msgId, fields] of messages) {
      const obj = parseFields(fields);
      signals.push({
        type: obj['type'] as StreamSignal['type'],
        target_id: obj['target_id'],
        detail: obj['detail'],
        source_session: obj['source_session'],
        agent_id: obj['agent_id'],
        timestamp: obj['timestamp'],
      });

      // Auto-ACK
      await this.redis.xack(SIGNALS_STREAM, group, msgId);
    }

    return signals;
  }
}

export class EpisodicBuffer {
  constructor(private redis: Redis) {}

  /**
   * Add a micro-event to the episodic buffer stream.
   * Returns the XADD message ID.
   */
  async add(sessionId: string, event: BufferEvent): Promise<string> {
    const id = await this.redis.xadd(
      EPISODIC_BUFFER_STREAM,
      '*',
      'session_id', sessionId,
      'event_type', event.event_type,
      'content', event.content,
    );
    if (!id) throw new Error('XADD returned null');
    return id;
  }

  /**
   * Flush all buffered events for a given session.
   * Reads the full stream, filters by sessionId, deletes consumed entries,
   * and returns the matching events.
   */
  async flush(sessionId: string): Promise<BufferEvent[]> {
    const results = await this.redis.xrange(
      EPISODIC_BUFFER_STREAM,
      '-',
      '+',
    ) as [string, string[]][];

    if (!results || results.length === 0) return [];

    const events: BufferEvent[] = [];
    const toDelete: string[] = [];

    for (const [msgId, fields] of results) {
      const obj = parseFields(fields);
      if (obj['session_id'] === sessionId) {
        events.push({
          event_type: obj['event_type'],
          content: obj['content'],
        });
        toDelete.push(msgId);
      }
    }

    if (toDelete.length > 0) {
      await this.redis.xdel(EPISODIC_BUFFER_STREAM, ...toDelete);
    }

    return events;
  }
}
