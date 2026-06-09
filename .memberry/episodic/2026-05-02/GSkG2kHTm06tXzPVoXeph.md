---
id: GSkG2kHTm06tXzPVoXeph
session_id: autonomous-fugazi-2026-05-02
agent_id: mcp
task: [project:fugazi] Phase 3g landed — runtime intelligence (greenfield) complete; detection layer total now wraps
outcome: approved
created_at: "2026-05-02T19:00:36.188Z"
---

[project:fugazi] Phase 3g landed at a0dcdd8 — first greenfield slice (no Rust source to port). Two-wave dispatch:

Wave A (uncommitted intermediate state): runtime/{types,coverage-shape,hot-path,cold-code,index}.ts + 38 tests. Standalone detector functions with v1 line:0/col:0 deferral documented. CoverageIndex provides byFile + byFunction views; anonymous function name collisions disambiguated with ::<i> suffix; uniform-distribution short-circuit for hot-path; coverageMissing tracked separately from coldCode (NOT a RuleId — surfaced via RuntimeReport sidecar).

Wave B (bundled into single Phase 3g commit): runtime-weighted health, --coverage-root rebase auto-detection, Vitest column:null warn-once, runRuntime entry point + RuntimeReport schema, runAnalysis integration. 26 new tests (6+5+6+4+5).

Architectural decisions:
- Hot-path / cold-code findings live in RuntimeReport.hotPaths / RuntimeReport.coldCode, NOT registered in the rule registry. RuleContext intentionally does not carry coverage — adding it would leak runtime concerns into the static rule layer. The DiscriminatedIssue counterparts (HotPathIssue, ColdCodeIssue) will be populated by the reporter layer in Phase 3h, where the CLI/LSP/MCP have access to source text for line/col conversion.
- runRuntime is invoked by runAnalysis ONLY when options.coverage is provided. Two new ProgressEvent kinds (runtime.start/done) fire only on this path. LSP preBuiltGraph fast-path preserves the empty complexity-by-path map.
- Coverage rebase: explicit mode delegates to @fugazi/v8-coverage's rebaseCoverage; auto-detect uses longest-common-prefix with 50%-match validation, throws FugaziCoverageError(COVERAGE_REBASE_AMBIGUOUS) on indecisive mappings. Verbatim "--coverage-root auto: cannot determine unambiguous mapping (matched <N> of <M> paths)" fixture-asserted.
- Vitest column:null tolerance: parseCoverage in v8-coverage gained ParseCoverageOptions.onColumnNull callback. Wave B's vitest-tolerance.ts wires this to warnOncePerFile from @fugazi/extract. Verbatim "runtime-coverage: column field missing or null in <file>; treating as column 0" fixture-asserted.
- weighted-health formula: weight = complexity * log10(1 + hits). Zero-hit functions get multiplier 0 (deprioritized). Mirrors Phase 3f.5 score with weighted CC.

Repo state: 34 commits ahead of main, 1151 active + 7 skipped tests (218 types + 124 config + 300 extract + 171 graph + 55 v8-coverage + 283 core). All gates green.

Detection layer is now feature-complete. Phase 3h (CLI/LSP/MCP/Node-API user-facing surfaces) is next — biggest phase by scope. Recommend treating each sub-phase (3h.1-3h.6) as its own session boundary given the variety of frameworks involved (clipanion, vscode-languageserver-node, @modelcontextprotocol/sdk, programmatic Node API).