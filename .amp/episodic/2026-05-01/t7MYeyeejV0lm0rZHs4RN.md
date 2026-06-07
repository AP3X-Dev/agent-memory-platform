---
id: t7MYeyeejV0lm0rZHs4RN
session_id: autonomous-fugazi-2026-04-30
agent_id: mcp
task: [project:fugazi] Phase 3c.3 Dispatch A complete — msgpackr cache codec + writer/reader
outcome: approved
created_at: "2026-05-01T13:47:09.502Z"
---

[project:fugazi] Dispatch A landed at commit 7c34b9b. Implements T055-test + T056 from docs/superpowers/plans/02-phase-3c-3d-3e.md.

Codec (packages/extract/src/cache/codec.ts, 95 lines): CACHE_VERSION=1 constant, 4-byte big-endian uint32 magic prefix, msgpackr Packr w/ useRecords:false for byte-deterministic encode. decode throws FugaziCacheError(CACHE_CORRUPTED) on sub-magic OR msgpackr failure; version mismatch is NOT corruption (caller's policy).

Store (packages/extract/src/cache/store.ts, 151 lines): createStore(cacheDir) opaque handle, async writeCache/readCache with verbatim CACHE_WRITE_FAILED format `Cache write failed for key '<key>' at '<path>': <cause.message>`. readCache returns null on ENOENT/ENOTDIR + version mismatch; propagates CACHE_CORRUPTED.

Key derivation: deriveKey(parts) uses LENGTH-PREFIX-then-NUL encoding (NOT pure NUL-separation). Subagent caught the ambiguity: pure NUL-separation collides on ('a','b\\0c','d') vs ('a','b','c\\0d'). The 4-byte big-endian uint32 length prefix per component makes the encoding genuinely unambiguous; trailing NUL is defensive.

Tests: 20 new in cache-roundtrip.test.ts (5 round-trip + 2 determinism + 2 version stamp + 4 corruption + 4 key derivation + 3 store I/O). Total 73 in @fugazi/extract; 417 repo-wide.

Dependency added: msgpackr@^1.11.10 (pure JS, no native binding).

Lessons: msgpackr Packr({useRecords:false}) is the option needed for byte-deterministic encode (the structural-sharing dictionary depends on cross-call insertion order otherwise). Length-prefix vs pure-separator key derivation matters when separator bytes can appear in component values.

Next: Dispatch B (T057-test + T058 + T059-test + T060) — fast/slow path with xxhash-wasm + proper-lockfile. Will require generalizing codec/store to accept a generic value type (CacheEntry = {meta:{mtime,size,xxh3}, result:ScanResult}) since the Dispatch A surface is currently ScanResult-typed.