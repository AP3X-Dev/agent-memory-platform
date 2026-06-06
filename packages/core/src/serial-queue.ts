// packages/core/src/serial-queue.ts
//
// In-process keyed mutex: serializes async work per key while letting different
// keys run concurrently. Used to serialize writes that touch the SAME entity
// (dream materialization, fact creation) so two passes can't interleave a
// create against an invalidate, or both mint the same hypothesis. This is the
// logical analogue of the Neo4j "one session = one query at a time" rule.
//
// NOTE: single-process only. For cross-process safety on a shared scope, use the
// Redis DistributedLock (see ConsolidationEngine). The dream pass uses BOTH: the
// scope-level DistributedLock across processes and this per-entity queue within.

export class KeyedSerialQueue {
  private tails = new Map<string, Promise<unknown>>();

  /** Queue `fn` behind any in-flight work for `key`; resolves with fn's result. */
  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    // .catch(() => {}) so a rejected predecessor doesn't poison the chain; each
    // caller still observes its own fn's rejection via the returned promise.
    const next = prev.catch(() => undefined).then(fn);
    this.tails.set(key, next);
    // Drop the entry once this is the tail, so the map can't grow unboundedly.
    void next.catch(() => undefined).finally(() => {
      if (this.tails.get(key) === next) this.tails.delete(key);
    });
    return next;
  }

  /** Number of keys with in-flight or queued work (for tests/introspection). */
  get activeKeys(): number {
    return this.tails.size;
  }
}
