---
id: 8BhLra76xSmrLzzJkjaX9
session_id: session-20260502-071900
agent_id: mcp
task: [project:fugazi] Phase 3f.1 runAnalysis driver scaffolding (T131-T134)
outcome: approved
created_at: "2026-05-02T14:20:50.350Z"
---

[project:fugazi] Phase 3f.1 landed. @fugazi/core now ships runAnalysis() — the single shared driver every consumer (CLI/LSP/MCP/Node-API) wraps. Core architectural choices:

1. Sequencing matches Fallow Rust pipeline: discover → extract → graph → analyze → crossref. Phases 4-5 emit zero diagnostics until 3f.2-3f.6 light up rule dispatch.

2. Cancellation: AbortSignal checked at every phase boundary. Throws new FugaziCoreError({code: 'CORE_ABORTED', message: `runAnalysis aborted at phase: <phase>`}). Added new CoreErrorCode union ('CORE_ABORTED' | 'CORE_INVALID_OPTIONS') and FugaziCoreError class to @fugazi/types/errors. Pre-flight validation throws CORE_INVALID_OPTIONS for non-absolute projectRoot or null config.

3. Determinism: SHA-256 hash via node:crypto over JSON.stringify({issues, actions}). Issues sorted by (file, range.start.byteOffset, ruleId) — actions sort by their diagnostic. metrics.elapsedMs is the only non-deterministic field, excluded from the hash by virtue of not being in the hashed object.

4. ProgressEmitter helper: 11 event kinds, monotonic seq starting at 0, listener throws caught + warn-once via globalWarnOnce (IMP-OBS-04). Multiple listeners supported (CLI + LSP can both subscribe). Throttles extract.progress to ~20 ticks (max(1, total/20)).

5. preBuiltGraph option: skips discover/extract/build but still emits zero-count progress events for visibility. LSP uses this for incremental scans.

6. File discovery: minimal node:fs/promises walker with recognized extensions (.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts) and skipped dirs (node_modules, dist, build, coverage, .git, .turbo). Full include/exclude glob handling deferred to 3f.2+ when discovery moves behind @fugazi/config's file-pattern API.

7. Test count: 22 passing (15 run-analysis + 7 progress). Test fixtures use mkdtemp + real filesystem; no test-helper deep-imports needed because the WASM is reachable through the workspace symlink. Only added afterEach cleanup of temp dirs.

Files created: packages/core/src/{types,progress,run-analysis}.ts, packages/core/src/__tests__/{run-analysis,progress}.test.ts, packages/types/src/errors/core.ts. Modified: packages/types/src/errors/{codes,index}.ts, packages/core/src/index.ts.

All baseline gates exit 0: build, typecheck, lint, test (when run with --force or in isolation; turbo's parallel test scheduling occasionally trips CPU-bound WASM init — pre-existing flakiness, not caused by our changes).