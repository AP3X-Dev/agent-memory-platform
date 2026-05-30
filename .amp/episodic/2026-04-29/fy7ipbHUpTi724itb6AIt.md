---
id: fy7ipbHUpTi724itb6AIt
session_id: session-20260429-104500
agent_id: mcp
task: [project:ap3x-core] Execute PRP-CORE: SQLite pragma config, PostgresCheckpointer hardening, long-running stream graph pattern doc.
outcome: approved
created_at: "2026-04-29T18:01:04.297Z"
---

[project:ap3x-core] PRP-CORE executed against ap3x-core. Key decisions and findings:

1. Discovered PRP↔reality divergence at audit time: PostgresCheckpointer + RedisCheckpointer already shipped in v1.0.0 with AP3X-style schema. Surfaced to user; user approved keeping existing schema and treating PRP as hardening + gap-fill rather than greenfield.

2. SqliteCheckpointer: existing code already had journal_mode=WAL + synchronous=NORMAL but was MISSING busy_timeout entirely (default 0 → immediate SQLITE_BUSY under contention). The PRP's stated motive ("old defaults caused outages") was technically wrong for ap3x-core. Real fix was busy_timeout=30000 + cache_size + temp_store.

3. Multi-process stress test required: better-sqlite3 is synchronous within one process, so single-process tests can't reproduce SQLITE_BUSY. Used worker_threads with separate connections to drive real contention. 4 workers × 15_000 writes (full profile) reproduces busy errors at busy_timeout=0, zero errors at busy_timeout=30000.

4. PostgresCheckpointer hardened with object-form constructor: { connectionString, schema?, poolSize?, ssl? }. Schema option creates a Postgres schema (namespace) and qualifies table as <schema>.ap3x_checkpoints. Existing string-form constructor still works.

5. pg declared as optional peer dependency (was previously imported but undeclared — bug). Documented as exception in CLAUDE.md alongside better-sqlite3, ioredis, redis.

6. Shared parity test suite (src/__tests__/checkpointer-parity-suite.ts) — 14 behavioral tests parameterized over Memory/SQLite/Postgres/Redis backends. Postgres and Redis run against real backends in CI when AP3X_PG_URL / REDIS_URL are set.

7. CI workflow: added postgres-tests matrix job (PG 14/15/16 service containers) running parity + latency benchmarks. Local docker not available, so PG verification gated on CI run.

8. streamGraph helper deferred — supervisor loop pattern is ~15 LOC, below PRP's 30-LOC threshold. Pattern doc covers wiring; helper would be over-configurable for variable consumer needs.

9. pnpm 10's onlyBuiltDependencies needed for native modules. Set in package.json. CI must run pnpm install with build approval for SQLite stress test to find native binding.

10. Pattern doc reviewer left as TODO until PRP-PRODUCT-001 author exists as real reader. Gate item #1 stays open.

Test evidence: 1642 tests pass (4 skipped — env-gated). Full stress profile (60_000 writes) zero busy errors at new defaults in 7.2s; reproduces busy errors at old defaults in 2.5s.