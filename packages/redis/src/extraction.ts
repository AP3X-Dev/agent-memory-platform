// packages/redis/src/extraction.ts
//
// Durable fact-extraction job queue backed by a Redis Stream + consumer group.
//
// store() enqueues a job (one XADD, persisted) and returns immediately; a
// long-lived consumer (the MCP server) drains the stream and runs extraction.
// Unlike the previous in-process `void` approach, a job survives a process
// crash: unacked entries sit in the group's Pending Entries List and are
// reclaimed via XAUTOCLAIM on the next consumer pass. Jobs that exhaust their
// retries are moved to a dead-letter stream rather than silently dropped.

import type { Redis } from 'ioredis';

export const EXTRACTION_STREAM = 'amp:extraction-jobs';
export const EXTRACTION_DLQ = 'amp:extraction-jobs-dlq';
export const EXTRACTION_GROUP = 'extractors';

export interface ExtractionJob {
  episodeId: string;
  content: string;
  /** Retry count; 0 on first enqueue. */
  attempt?: number;
}

export interface ExtractionJobEntry extends ExtractionJob {
  /** Stream message id (for ack). */
  id: string;
  attempt: number;
}

export interface ExtractionQueueStats {
  /** Unprocessed jobs waiting in the main stream. */
  pending: number;
  /** Delivered-but-unacked jobs (in-flight / possibly stuck). */
  inflight: number;
  /** Jobs that exhausted retries and were dead-lettered. */
  deadLettered: number;
}

function parseFields(fields: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];
  return obj;
}

export class ExtractionQueue {
  constructor(private redis: Redis) {}

  /** Create the consumer group (and the stream) if absent. Idempotent. */
  async ensureGroup(): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', EXTRACTION_STREAM, EXTRACTION_GROUP, '$', 'MKSTREAM');
    } catch (err: unknown) {
      if (err instanceof Error && !err.message.startsWith('BUSYGROUP')) throw err;
    }
  }

  /** Persist a job. Returns the stream message id. */
  async enqueue(job: ExtractionJob): Promise<string> {
    const id = await this.redis.xadd(
      EXTRACTION_STREAM, '*',
      'episodeId', job.episodeId,
      'content', job.content,
      'attempt', String(job.attempt ?? 0),
    );
    if (!id) throw new Error('XADD returned null');
    return id;
  }

  private toEntry(msgId: string, fields: string[]): ExtractionJobEntry {
    const o = parseFields(fields);
    return {
      id: msgId,
      episodeId: o['episodeId'] ?? '',
      content: o['content'] ?? '',
      attempt: Number(o['attempt'] ?? '0'),
    };
  }

  /** Read new (never-delivered) jobs for this consumer. */
  async read(consumer: string, count: number): Promise<ExtractionJobEntry[]> {
    await this.ensureGroup();
    const res = (await this.redis.xreadgroup(
      'GROUP', EXTRACTION_GROUP, consumer,
      'COUNT', count,
      'STREAMS', EXTRACTION_STREAM, '>',
    )) as [string, [string, string[]][]][] | null;
    if (!res || res.length === 0) return [];
    const [, messages] = res[0];
    return messages.filter((m) => m && m[1]).map(([id, fields]) => this.toEntry(id, fields));
  }

  /**
   * Reclaim jobs that were delivered to a consumer that then died (idle longer
   * than minIdleMs). This is the crash-recovery path: a job read but never
   * acked (e.g. the server was killed mid-extraction) is picked back up.
   */
  async claimStale(consumer: string, minIdleMs: number, count: number): Promise<ExtractionJobEntry[]> {
    await this.ensureGroup();
    const res = (await (this.redis as unknown as {
      xautoclaim: (...args: unknown[]) => Promise<unknown>;
    }).xautoclaim(EXTRACTION_STREAM, EXTRACTION_GROUP, consumer, minIdleMs, '0', 'COUNT', count)) as
      | [string, [string, string[]][], string[]?]
      | null;
    if (!res) return [];
    const messages = (res[1] ?? []) as [string, string[]][];
    return messages.filter((m) => m && m[1]).map(([id, fields]) => this.toEntry(id, fields));
  }

  /** Mark a job done: ack it and remove it from the stream. */
  async ack(id: string): Promise<void> {
    await this.redis.xack(EXTRACTION_STREAM, EXTRACTION_GROUP, id);
    await this.redis.xdel(EXTRACTION_STREAM, id);
  }

  /** Move a permanently-failed job to the dead-letter stream. */
  async deadLetter(job: ExtractionJobEntry, error: string): Promise<void> {
    await this.redis.xadd(
      EXTRACTION_DLQ, '*',
      'episodeId', job.episodeId,
      'content', job.content,
      'attempt', String(job.attempt),
      'error', error.slice(0, 500),
      'failed_at', new Date().toISOString(),
    );
  }

  /** Snapshot of queue health for observability/admin tooling. */
  async stats(): Promise<ExtractionQueueStats> {
    const [pending, deadLettered] = await Promise.all([
      this.redis.xlen(EXTRACTION_STREAM),
      this.redis.xlen(EXTRACTION_DLQ),
    ]);
    let inflight = 0;
    try {
      const p = (await this.redis.xpending(EXTRACTION_STREAM, EXTRACTION_GROUP)) as unknown as unknown[];
      inflight = Array.isArray(p) ? Number(p[0] ?? 0) : 0;
    } catch {
      // group may not exist yet
    }
    return { pending: Number(pending), inflight, deadLettered: Number(deadLettered) };
  }

  /** Re-enqueue dead-lettered jobs (admin repair). Returns the number replayed. */
  async replayDeadLetters(limit = 100): Promise<number> {
    const res = (await this.redis.xrange(EXTRACTION_DLQ, '-', '+', 'COUNT', limit)) as [string, string[]][];
    let moved = 0;
    for (const [msgId, fields] of res) {
      const o = parseFields(fields);
      await this.enqueue({ episodeId: o['episodeId'] ?? '', content: o['content'] ?? '', attempt: 0 });
      await this.redis.xdel(EXTRACTION_DLQ, msgId);
      moved++;
    }
    return moved;
  }
}
