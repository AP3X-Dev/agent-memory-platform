---
id: cL6EHhaSzhzGmxEXnkdh8
session_id: autonomous-fugazi-2026-04-30
agent_id: mcp
task: [project:fugazi] Phase 3c.2 Wave 5b-4 complete — ScanError fail-soft wrapper + aggregator
outcome: approved
created_at: "2026-05-01T13:09:37.003Z"
---

[project:fugazi] Wave 5b-4 landed at commit 3e4348e on branch phase-3-foundation. Implements T053-test + T054 from docs/superpowers/plans/02-phase-3c-3d-3e.md.

Phase 3c.2 closes with this commit. Wave 5b-3 (SWC fallback + parser equivalence) was DEFERRED in commit 917ba5e (Wave 5b-2): since 5b-2 selected SWC as primary (no maintained oxc-parser-WASM npm package), the literal "SWC fallback" task is moot. A true second engine for cross-validation can land later when coverage/risk signals indicate need.

ScanError discriminated union (3 kinds): parse_failed (1:1 with ParseError from oxc.ts), unsupported_language (extension-dispatch short-circuit before parse), io (FS_PATH_NOT_FOUND only — FS_READ_FAILED waits for Phase 3d when scanPath() lands).

Verbatim contract messages: unsupportedLanguageMessage(file, ext) and pathNotFoundMessage(file) both fixture-asserted byte-for-byte per IMP-CORRECT-09.

scanFile(filename, source): returns {ast, errors} — never throws on syntax errors. WASM integrity/missing STILL throw (configuration failures, not per-file ScanErrors). Extension dispatch is case-insensitive (`.TS` recognized as ts) and Windows-aware (handles both `/` and `\` separators in extensionOf).

ScanErrorAggregator: insertion-stable add()/addMany(); drain() returns NEW SORTED COPY (file → kind-priority → line → column, bare lex no localeCompare per SC-15) without mutating internal state. Repeated drain() calls return EQUAL arrays; clear() empties; add() after clear() works.

Files: packages/extract/src/scan-error.ts (76 lines), parsers/scan.ts (~140 lines), src/__tests__/scan-error.test.ts (310 lines, 14 tests). Re-exported from packages/extract/src/index.ts. No new dependencies; no changes to @fugazi/types or other packages.

Repo state: 397 tests pass (220 types + 124 config + 53 extract = 15 wasm + 24 parser + 14 scan-error). All seven gates exit 0. Build byte-deterministic.

Next: Phase 3c.3 parse cache (T055..T060) — msgpackr cache writer/reader, byte-deterministic round-trip, version stamp + cache-version mismatch handling, advisory file locking via proper-lockfile, MAX_PARSE_CACHE_SIZE eviction policy.