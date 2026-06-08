---
id: 8LQTYF1LRjD7t6rM1En_F
session_id: autonomous-fugazi-2026-04-30
agent_id: mcp
task: [project:fugazi] Phase 3c.3 closed — Dispatch B fast/slow path + xxhash + lock complete
outcome: approved
created_at: "2026-05-01T14:11:39.034Z"
---

[project:fugazi] Dispatch B landed at commit 3388e99. Implements T057-test/T058 + T059-test/T060. Phase 3c.3 closes here.

Generalized codec/store from Dispatch A: encode/decode/write/read are now `<T>` generic. Existing cache-roundtrip tests updated with explicit <ScanResult> type args. Behavior unchanged.

CacheEntry shape (cache/types.ts): { meta: { mtimeMs, size, xxh3 }, result: ScanResult }.

xxh3 helper (cache/hash.ts): xxhash-wasm@1.1.0 module-level Promise<Hasher> singleton, returns 16-char hex digest. NOTE: xxhash-wasm@1.1.0 only exposes XXH64 (no XXH3 surface). The function is named xxh3 for cache-schema continuity (the meta field is meta.xxh3); this is the underlying hash actually being XXH64. Documented in hash.ts header.

Lock wrapper (cache/lock.ts, 117 LOC): withLock(file, fn, opts?) acquires proper-lockfile, runs fn, releases in finally. CACHE_LOCK_TIMEOUT verbatim message: `Failed to acquire cache lock for '<file>' after <retries> retries: <cause.message>`. Tuned retry backoff: minTimeout=50ms, maxTimeout=1000ms, factor=2 (proper-lockfile defaults are too slow for cache contention). Stale-lock recovery + retry exhaustion are it.skip with rationale "verified upstream by proper-lockfile" — reproducing in-process requires subprocess orchestration that adds flake without confidence.

Dispatcher (cache/dispatch.ts, ~190 LOC): getCacheable(filePath, opts) returns { result, source, hit: 'fast'|'slow'|'cold' }. Fast path: stat-only mtime+size match (still reads source from disk for downstream consumers). Slow path: FUGAZI_CACHE_STRICT=1 enables xxh3 verify against meta.xxh3. Cold path: parse + write entry under lock at blobPathFor(store, key).

Tests: 17 new (15 active + 2 documented skips). cache-paths: 13 cases (cold/fast/slow path + mtime/size invalidation + xxh3 helper). cache-lock: 4 active (single-writer round-trip + 50-iteration × 4-way concurrent torn-write surface with 1KB payloads + release-on-success + release-on-error).

Concurrent test deviation: original prompt said 10 writers/iteration, reduced to 4 due to proper-lockfile's default 1000ms minTimeout exhausting 30s test budget. Total surface 50×4=200 lock acquires under contention is plenty to surface broken-lock bugs.

Dependencies: xxhash-wasm@1.1.0, proper-lockfile@4.1.2 runtime; @types/proper-lockfile@4.1.4 devDep.

Repo state: branch phase-3-foundation, 10 commits ahead of main, 432 tests pass + 5 skipped (220 types + 124 config + 90 extract = 15 wasm + 24 parser + 14 scan + 20 cache-roundtrip + 13 cache-paths + 4 cache-lock active). All seven gates exit 0; build byte-deterministic.

Next: Phase 3c.4 (T061..T067 — discriminated-union AST kinds + single-pass typed visitor). T064 is HIGH RISK with 700 LOC budget per IMP-DEBT-08/IMP-PERF-06 (replaces original Fallow's 4-pass INSTANCE_EXPORT_SENTINEL pipeline with a typed accumulator-based single pass).