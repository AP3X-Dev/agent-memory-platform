// packages/core/src/extraction-consumer.ts
//
// Long-lived worker that drains the durable fact-extraction queue. Runs in the
// MCP server (not the short-lived CLI). It reclaims jobs orphaned by a crashed
// consumer (claimStale), processes each with the injected handler, acks on
// success, re-enqueues with an incremented attempt on transient failure, and
// dead-letters once maxAttempts is exhausted — so extraction is durable and
// failures are visible rather than silently dropped.

export interface QueuedJob {
  id: string;
  episodeId: string;
  content: string;
  tenantId?: string;
  attempt: number;
}

/** Structural port over @memberry/redis ExtractionQueue (avoids a hard dep). */
export interface ExtractionQueuePort {
  ensureGroup(): Promise<void>;
  read(consumer: string, count: number): Promise<QueuedJob[]>;
  claimStale(consumer: string, minIdleMs: number, count: number): Promise<QueuedJob[]>;
  ack(id: string): Promise<void>;
  enqueue(job: { episodeId: string; content: string; tenantId?: string; attempt?: number }): Promise<string>;
  deadLetter(job: QueuedJob, error: string): Promise<void>;
}

export interface ExtractionConsumerOptions {
  consumerName?: string;
  batch?: number;
  pollMs?: number;
  idleReclaimMs?: number;
  maxAttempts?: number;
}

export class ExtractionConsumer {
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private readonly consumerName: string;
  private readonly batch: number;
  private readonly pollMs: number;
  private readonly idleReclaimMs: number;
  private readonly maxAttempts: number;

  constructor(
    private queue: ExtractionQueuePort,
    private handler: (content: string, episodeId: string, tenantId?: string) => Promise<void>,
    opts: ExtractionConsumerOptions = {},
  ) {
    this.consumerName = opts.consumerName ?? `consumer-${process.pid}`;
    this.batch = opts.batch ?? 8;
    this.pollMs = opts.pollMs ?? 1000;
    this.idleReclaimMs = opts.idleReclaimMs ?? 60_000;
    this.maxAttempts = opts.maxAttempts ?? 3;
  }

  async start(): Promise<void> {
    if (this.running) return;
    await this.queue.ensureGroup();
    this.running = true;
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.loopPromise) {
      try { await this.loopPromise; } catch { /* ignore */ }
      this.loopPromise = null;
    }
  }

  /** Process whatever is currently available, once. Returns the job count handled. */
  async drainOnce(): Promise<number> {
    const reclaimed = await this.queue
      .claimStale(this.consumerName, this.idleReclaimMs, this.batch)
      .catch(() => [] as QueuedJob[]);
    const fresh = await this.queue.read(this.consumerName, this.batch).catch(() => [] as QueuedJob[]);
    const jobs = [...reclaimed, ...fresh];
    for (const job of jobs) await this.handle(job);
    return jobs.length;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const n = await this.drainOnce();
        if (n === 0) await this.sleep(this.pollMs);
      } catch (err) {
        console.error('[amp-extraction] consumer loop error:', err instanceof Error ? err.message : err);
        await this.sleep(this.pollMs);
      }
    }
  }

  private async handle(job: QueuedJob): Promise<void> {
    try {
      await this.handler(job.content, job.episodeId, job.tenantId);
      await this.queue.ack(job.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (job.attempt + 1 >= this.maxAttempts) {
        console.error(
          `[amp-extraction] job ${job.id} (episode ${job.episodeId}) failed permanently ` +
          `after ${job.attempt + 1} attempt(s); dead-lettering:`, msg,
        );
        await this.queue.deadLetter(job, msg);
      } else {
        console.warn(`[amp-extraction] job ${job.id} attempt ${job.attempt + 1} failed; re-enqueuing:`, msg);
        await this.queue.enqueue({ episodeId: job.episodeId, content: job.content, tenantId: job.tenantId, attempt: job.attempt + 1 });
      }
      // Remove the current delivery either way (we've re-enqueued or dead-lettered).
      await this.queue.ack(job.id);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
