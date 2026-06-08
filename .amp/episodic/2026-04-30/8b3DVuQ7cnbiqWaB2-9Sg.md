---
id: 8b3DVuQ7cnbiqWaB2-9Sg
session_id: session-20260430-014700
agent_id: mcp
task: [project:fugazi] FULL resume prompt (verbatim) — paste as first user message in next session
outcome: approved
created_at: "2026-04-30T11:45:39.723Z"
---

[project:fugazi] FULL RESUME PROMPT (verbatim — paste as first user message at C:\Users\Guerr\Desktop\Fugazi after device reset):

Resume the Fugazi clean-room rewrite from a prior session. Phase 1 is mostly done; merge + a few final passes outstanding. Continuation, not fresh start.

WHAT FUGAZI IS: TS/Node clean-room port of Fallow (MIT-licensed Rust static analyzer for TS/JS, https://github.com/fallow-rs/fallow). Original at C:\Users\Guerr\Downloads\fallow-main\fallow-main. Workspace at C:\Users\Guerr\Desktop\Fugazi. Mode: Transparent (MIT permits direct reading).

CRITICAL SCOPE: Fugazi has NO license gate, NO paid tier, NO JWT verification, NO grace ladder, NO sidecar signing, NO `fallow license` subcommand, NO FALLOW_LICENSE env var, NO "where licensed" conditional. Whole point: ship Fallow's currently-paid runtime-intelligence (hot/cold paths, runtime-weighted health, stale-flag evidence, trends, alerts) as FREE features. Runtime sidecar wire format designed from scratch (fallow-cov-protocol is closed-source). Pass-4/Pass-7 sections describing license machinery: mark "descriptive of original only — out of scope for Fugazi"; do NOT carry into PRP.md.

PRE-FLIGHT:
1. DISK. Last session blocked at C: 100% full / 13 MB free. Run `df -h C:/Users/Guerr/Desktop/Fugazi`. If under ~20 GB free, stop and ask user to reclaim.
2. AMP. amp_load(task: "resume Fugazi clean-room rewrite", tags: ["project:fugazi"], max_tokens: 6000). 25 entities, 15 priors, 1 correction (no-paywall), feedback memory. Episode 0tw-EeNiBeQXRGpKkZK2k carries this resume prompt summary; episodes tagged session-handoff have full content.
3. STATE. Read clean-room/DESIGN_DOC.md (§0+§1 written, §2-§9 placeholders). ls clean-room/passes/ — eight files: pass-2-external-surface, pass-3-public-contract, pass-4a-cli, pass-4b-core-orchestration, pass-4c-extract-graph-config, pass-4d-plugins-lsp-mcp-license, pass-5-8-data-cross, pass-9-tests. Pass 4c covers types/config/extract/graph including ADR-005 re-export chain pseudocode. All Wave-2 agents returned.
4. INVENTORY. clean-room/inventory.json (~10 MB, 12109 symbols, 382 call_edges, 15 field_io). Re-extract only if missing.

PHASE 1 REMAINING (in order):
1. Merge passes into DESIGN_DOC.md. §4 = pass-4a + 4b + 4c + 4d concatenated; §5+§8 from pass-5-8 split; §9 direct.
2. Pass 4.5 (Wires). `python C:/Users/Guerr/.claude/skills/clean-room/scripts/generate-wire-ledger.py clean-room/inventory.json -o clean-room/wires.json --design-doc clean-room/DESIGN_DOC.md`. Then dispatch one subagent to fill prose fields (what_data_represents / invariant / if_broken_symptom). Subagent annotates only, does not add wires.
3. Wave 3: Pass 6 (Control Flow + Concurrency: pipeline, watch, LSP, MCP, fix workflow, coverage-setup state machine) and Pass 7 (Errors + Edge Cases — CRITICAL, #1 source of rewrite divergence) in parallel.
4. Pass 10 (Verification gap-hunt). Re-read DESIGN_DOC without source. Where would a stranger guess? Fill those gaps.
5. COVERAGE.md via generate-coverage.py --wires clean-room/wires.json. Mark license-related items [-] out-of-scope.

PHASE 2:
2a. Parallel improvement sweeps (architecture, performance, correctness, API ergonomics, modernization, observability, security, testing, DX, docs, tech debt). Rust→TS surfaces big arch decisions: parser, parallelism, graph-in-V8.
2b. Stakeholder questionnaire: Bun vs Node, bundler, perf budget, runtime sidecar wire format, distribution (npm vs npm + Bun --compile), `fallow-ignore-*` migration alias, runtime-intelligence naming.
2c. Triage: impact / effort / divergence-risk / decision (accept/defer/reject) with reason. Rejected → log so Phase 3 can't reintroduce.
2d. PRP.md per template at C:\Users\Guerr\Desktop\skill jar\superpowers-2.0\skills\autonomous-advisor\prp-template.md.

PHASE 3: fresh session, hand PRP.md to superpowers:autonomous-advisor. Monitor only; if it asks unanswerable, amend PRP and resume — never answer ad hoc.

OPEN QUESTIONS (DESIGN_DOC §10): Q1 parser (oxc-parser WASM vs @swc/wasm-web vs @babel/parser); Q2 parallelism (worker_threads vs Bun.Worker vs cooperative async); Q3 cache format (CBOR is leading); Q4 fallow-ignore-* migration alias; Q5 runtime layer scope (no source, design fresh); Q6 ecosystem regression list (12 real public repos cloned at runtime — Pass 9 didn't enumerate); Q7 other N-API consumers.

KEY FINDINGS:
- 6 N-API exports (README under-counts at 3); 3 detect-* should collapse into one detector with filter flags.
- 21 CLI subcommands; 11 exit codes; 19 named rules; 20 suppression issue-types; 7 output formats; 15 MCP tools (only fix_apply mutates); 5 LSP capabilities; 47 GitHub Action inputs.
- 91 framework plugins.
- Duplicate detection is one suffix-array engine for all 4 clone categories — only normalization knobs differ.
- unused_files has 3 layered safety nets atop BFS reachability.
- changed-since needs `git rev-parse --show-toplevel` + path canonicalization (regression #190 for Turborepo subdirs).
- Determinism: V8 Map insertion-order is "less protective" than Rust FxHashMap; ordering bugs become latent. Keep explicit `.sort()` on every emit path; sort discovered files by path before assigning FileIds; CI byte-diff check.
- VS Code: LSP bundles into extension, drops 11 binary-staleness paths.
- ~50 property tests across 11 files = highest-value invariant catalog → fast-check.
- 145 project fixtures (18 themes), 8 conformance fixtures, 115 insta snapshots, 4 benchmark categories, 5 fuzz targets / 21 seeds, 12 ecosystem repos.
- Re-export propagation (ADR-005): synthetic-ExportSymbol star branch + entry_star_targets two-layer entry-point handling are non-obvious.
- Visitor post-processing: 4-pass enrichment using INSTANCE_EXPORT_SENTINEL channel — data prep, not analysis.

TASK LIST (recreate via TaskCreate):
Completed: Bootstrap+AMP, Pass 1, 1b, 2, 3, 4 (all subagents), 5, 8, 9.
Pending: Pass 4.5 Wires, Pass 6, Pass 7, Pass 10, COVERAGE.md, Phase 2a/b/c/d, Phase 3.

SKILLS: clean-room at C:\Users\Guerr\.claude\skills\clean-room (review SKILL.md if unclear). Phase 3: superpowers:autonomous-advisor. AMP setup done — do NOT re-run amp-setup.

Now: pre-flight (disk + AMP load + state verification), then continue. Report disk first; if tight, stop.