---
id: GMy5fvfcB25Dzw9_t66hL
session_id: autonomous-fugazi-2026-05-02
agent_id: mcp
task: [project:fugazi] Phase 3f FULLY COMPLETE — landed 5 sub-phases this session covering all detection rules
outcome: approved
created_at: "2026-05-02T17:08:48.754Z"
---

[project:fugazi] Major milestone: Phase 3f complete. 5 sub-phases landed on phase-3-foundation in this session — 65dfd29→90675b4, +5 commits.

3f.2 (0917a99): 13 dead-code rules + registry pattern. Two-wave dispatch (foundation + 6 rule files) merged into one commit to avoid registry conflicts. Rules: unused-files BFS (single-pass per IMP-PERF-07), unused-exports + unused-types (per-file consumer fallback v1), unused-deps trio (shared package.json walker, production-mode override applied in-handler), unused-members duo (parent-range emission, no inheritance modeling), circular-dependencies (iterative Tarjan SCC, lex-canonical walk), import-hygiene trio (one shared graph walk for unresolved + unlisted + duplicate-exports), private-type-leak (byte-range overlap heuristic). All verbatim error strings fixture-asserted byte-for-byte.

3f.3 (63b41c4): boundary-violations + zones config. Schema gained optional `zones: Record<name, {pattern, canImport}>`. Inline glob matcher (no picomatch dep). Per-edge resolution, NO transitive closure per E1.

3f.4 (d74cc33): duplicate-detection engine + 4 clone categories. Sync TS/JS tokenizer (comments stripped, string canonicalization, regex/divide heuristic, fail-soft). Prefix-doubling SA + Kasai LCP, ALL Uint32Array storage per IMP-PERF-09. Type-1 exact, Type-2 identifier collapse, Type-3 v1 dilation heuristic (windowed-LCS deferred), Type-4 token-stream AST rewrites (if-return↔ternary, for↔while). findAllClones dispatcher with Type-1≻2≻3≻4 subsumption.

3f.5 (90ddee4): health rules + per-file scoring. complexity-hotspot reads cyclomatic > 10 default, cognitive-complexity reads cognitive > 15 default. Both consume FileComplexity from @fugazi/extract Phase 3c.7. runAnalysis now computes complexity in extractOne and threads Map<FileId, FileComplexity> through RuleContext. Separate scoring API: computeFileScore (weighted normalized avg, default 0.3/0.3/0.4), computeProjectScore (mean), computeRefactorTargets (top-K), formatScoreLine. NaN/Infinity clamp to 100. LSP preBuiltGraph fast-path → empty map → health rules degrade gracefully.

3f.6 (90675b4): cross-reference filter. §4.B.5 — when unused-files flags a path, per-export/per-type/per-member findings on that path are dropped O(N). Filter runs between analyze.done and crossref.done; metrics.diagnosticsByRule re-derived against filtered list.

Repo state: 33 commits ahead of main, 1067 active + 7 skipped tests (218 types + 124 config + 300 extract + 171 graph + 55 v8-coverage + 219 core). All gates green: build/typecheck/lint/test/forbidden-strings/forbidden-fallow-env/verify-wasm. Working tree clean.

Architectural patterns now well-established:
- Rule registry: Map<RuleId, RuleHandler factory> with alphabetical iteration, severity-off filtering at dispatch, mode partitioning (audit/full/dead-code-only/dupes-only/health-only).
- WeakMap<RuleContext, AnalysisResult> for shared-walker memoization across rule families.
- In-memory test fabrication via fabricated Graph/FileNode/Inventory literals — disk I/O only when rule semantics require (package.json reads, source reads for code-duplication).
- Verbatim error strings fixture-asserted.
- Documented v1 limitations: per-symbol consumer tracking, inheritance modeling for unused-class-members, signature-level type analysis for private-type-leak, windowed-LCS for Type-3, re-export-aware target zones for boundaries — all defer to later visitor enrichment phases.

Next: Phase 3g — runtime intelligence (T167-T178). FIRST GREENFIELD slice — original Fallow had this paid; Fugazi promotes to free first-class. Hot-path detection, cold-code detection, runtime-weighted health. Input is NormalizedCoverage from Phase 3e v8-coverage. Stale-flag/trends/alerts deferred to v1.1.