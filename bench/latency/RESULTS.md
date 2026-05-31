# load() latency — sequential vs concurrent phasing

Controlled A/B (`load_latency.ts`). Both arms drive **identical mock layers** with
identical injected per-op latencies, so the only variable is round-trip *phasing*:

- **sequential** — faithful replica of the pre-optimization ordering
  (`await blocks → await semantics+vector → await facts → await expand`)
- **concurrent** — the current `AMPService.load()`
  (`await Promise.all([blocks, semantics+vector, facts]) → await expand`)

Injected: redis=1ms, neo4j=8ms, embedApi=120ms. 5 entities, blocks+facts present, 50 iters.

```
[cold embedding (API call)]
  sequential : 159.08 ms/load
  concurrent : 142.20 ms/load
  → 16.87 ms saved  (1.12× faster, 11% cut)

[warm embedding (cached — common repeated-load case)]
  sequential : 36.40 ms/load
  concurrent : 20.19 ms/load
  → 16.21 ms saved  (1.80× faster, 45% cut)
```

## Reading

The absolute saving (~16–17 ms) is the Neo4j round-trip time that now *overlaps*
the embedding + vector branch instead of being awaited before and after it. It's
a **constant** win independent of embedding latency. As a percentage it's modest
(~11%) when a cold embedding API call (120 ms) dominates the load, and large
(**45%, 1.8×**) on the warm path where the task embedding is already Redis-cached
— which is the typical case for repeated loads within a session.

Quality is unaffected: the change only reorders independent I/O; ranking, budgeting,
and rendering are byte-identical for identical data. Guarded by the `PERF-REGRESSION`
barrier test in `packages/core/src/__tests__/service.test.ts`.

Run: `npx tsx bench/latency/load_latency.ts [iters] [numEntities]`
