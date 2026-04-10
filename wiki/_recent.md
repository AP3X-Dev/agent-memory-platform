---
title: Recent Changes
compiled: 2026-04-10
entries: 50
---

# Recent Changes

## 2026-04-09

> **[agent-assist]** Brainstorming Markov Logic Tree for probing question progressive disclosure
> *Session: markov-logic-tree-brainstorm-2026-04-09*
> Markov Logic Tree Brainstorm — Probing Question Filtering

## Problem
Current system loads the full question set for a trade/job type combo (e.g., all 8 HVAC Demand Service questions). No fine-grained filtering within a set based on what the caller actually described. Agent sees irrelevant questions (e.g., sewage overflow questions on a sink clog call).

## Design Decisions Made
1. **Scope: Wit...

> **[scribo-2]** Phase 6: Wake word detection implementation **[APPROVED]**
> *Session: scribo-2-phase6-completion-20260409*
> Phase 6 complete: Wake word detection ported from Python to Rust. Three ONNX models (melspectrogram, embedding, hey_scribo) run via ort crate with load-dynamic feature (static linking failed due to MSVC C++ STL compatibility - __std_find_last_of_trivial_pos_1 unresolved symbols). Pipeline: raw audio → mel spectrogram → 96-dim embeddings → wake word probability. WakeListener runs continuous cpal...

> **[scribo-2]** Task 3: WakeListener — Audio Stream + State Machine **[APPROVED]**
> *Session: scribo2-phase6-task3-20260409*
> Implemented WakeListener in wake.rs with audio stream management, silence detection, and watchdog thread. Made encode_wav pub(crate) in recorder.rs so wake module can encode captured audio to WAV. WakeListener follows the same thread+Arc+Mutex pattern as RecordingHandle in recorder.rs. The cpal Stream lives inside the spawned audio thread (it's !Send), while the WakeListener struct holds Arc<Mu...

> **[scribo-v2]** Implement WakeDetector ONNX inference pipeline for wake word detection **[APPROVED]**
> *Session: scribo-v2-wake-detector-2026-04-09*
> Created src-tauri/src/wake.rs with WakeDetector struct that chains 3 ONNX models: melspectrogram.onnx (raw audio -> mel frames), embedding_model.onnx (mel frames -> 96-dim embeddings), and hey_scribo.onnx (16 embeddings -> probability score). Key implementation details: ort 2.0.0-rc.12 requires ndarray 0.17 (upgraded from 0.16 to match ort's dependency). The ort::inputs! macro with named args r...

> Phase 6 Task 1: Add ONNX models and ort/ndarray dependencies for wake word detection **[APPROVED]**
> *Session: scribo2-phase6-task1-20260409*
> Phase 6 Task 1 complete. Copied 3 ONNX model files into src-tauri/models/: melspectrogram.onnx (1.1MB), embedding_model.onnx (1.3MB), hey_scribo.onnx (202KB). These form the wake word pipeline: mel spectrogram → embedding → classifier. Added ort = "2.0.0-rc.12" and ndarray = "0.16" to src-tauri/Cargo.toml after the image dependency. Added "bundle": { "resources": ["models/*"] } to tauri.conf.js...

> **[scribo-2]** Resume development, identify next phase
> *Session: scribo-2-phase5-completion-20260409*
> Project state assessment: Phases 1-4 fully committed. Phase 5 Tasks 1-3 (screenshotter, vision, form_filler) committed. Phase 5 Task 4 (integration smoke test) pending. Uncommitted tweaks: config.rs default cleanup model changed to gemini-2.0-flash-001, processor.rs Groq cleanup now reads separate GROQ_CLEANUP_MODEL env var. Build cache was stale from project directory move (New folder (2) -> S...

> OAuth integration with portal.cicops.ai - agent profile and CIC tag auto-population
> *Session: oauth-integration-2026-04-09*
> Agent tag format is first name + last initial (e.g., "Jane S"). The CIC tag field in call forms needs to be auto-populated with the authenticated agent's tag from the profile endpoint. Profile endpoint (GET /api/v1/profile) will return email, name, and agent_tag. Agent tag attaches to forms on every call.

> Add post-drain form review integration test to test_drain_coordinator.py **[APPROVED]**
> *Session: agent-assist-task6-2026-04-09*
> Added TestPostDrainFormReview class to tests/test_drain_coordinator.py. The test verifies that _drain_cleanup spawns a background thread running _run_form_review_safe after drain completes. Uses threading.Event to assert async invocation, patches _run_form_review_safe to avoid real LLM calls, and asserts _on_form_review_complete callback fires exactly once. All 9 tests pass (8 existing + 1 new)...

> Task 5: Handle form-review-complete event in renderer **[APPROVED]**
> *Session: form-review-renderer-task5-2026-04-09*
> Added onFormReviewComplete event listener in renderer.js after the existing onCostUpdate listener (line 603). The handler updates customerInfoComponent and formQuestionsComponent when a post-drain form review result arrives via IPC. Follows the same pattern as onAssistUpdate and other existing listeners. Committed as feat: handle form-review-complete event in renderer.

> **[agent-assist]** Review Task 4 implementation - form review polling and IPC event **[APPROVED]**
> *Session: review-task4-form-review-2026-04-09*
> Verification of Task 4: Push Form Review Result via Dedicated IPC Event

REQUIREMENT 1 - preload.js onFormReviewComplete handler:
✓ FOUND at line 32: `onFormReviewComplete: (callback) => ipcRenderer.on('form-review-complete', (_event, data) => callback(data)),`
  - Correctly positioned after onAssistUpdate (line 31)
  - Uses exact event name 'form-review-complete'
  - Proper callback signature...

> Task 4: Push form review result via dedicated IPC event **[APPROVED]**
> *Session: form-review-ipc-task4-2026-04-09*
> Implemented Task 4 - added onFormReviewComplete IPC listener to preload.js and a post-drain form review poll in stopSession (main.js). After drain completes, a new setInterval polls GET /sessions/{id}/form-review every 1s up to 30 attempts (30s timeout), then pushes the result via 'form-review-complete' IPC channel. Key ordering change: stopPolling() moved before final data fetches, currentSess...

> Wire form review callback through API server (Task 3) **[APPROVED]**
> *Session: form-review-api-wiring-2026-04-09*
> Task 3 complete. Added _form_review_results dict at module level alongside _assist_states. Added _on_form_review_complete callback that calls assist_state.model_dump() and caches by session_id. Called _manager.set_on_form_review_complete(_on_form_review_complete) inside get_manager() after extraction pipeline setup — set_on_form_review_complete is a setter not a constructor arg, so it must be c...

> **[amp]** Item 16 Mode B — Additional dead import cleanup across 3 packages **[APPROVED]**
> *Session: amp-opt-S018*
> Continued Item 16 dead wire removal in Mode B. Performed systematic scan of all 40+ production source files across 8 packages, cross-referencing every import symbol against in-file usage. Found and removed 3 genuinely dead imports: readFile/stat in code/indexer.ts (only readdir is used, file reading handled by parser.ts), StabilityTier in arch/context.ts (only ArchContext consumed), RetrievalRe...

> Task 2: Add post-drain form review in SessionManager **[APPROVED]**
> *Session: task2-post-drain-form-review-2026-04-09*
> Added post-drain form review wiring to SessionManager. Four changes: (1) added _on_form_review_complete = None in __init__ after _on_analysis_ready, (2) added set_on_form_review_complete() public setter before create_session, (3) modified _drain_cleanup to spawn a daemon thread targeting _run_form_review_safe after cleanup, (4) added _run_form_review_safe wrapper that calls _run_form_review, ca...

> Remove form review from DrainCoordinator drain sequence **[APPROVED]**
> *Session: drain-form-review-refactor-2026-04-09*
> Removed form_review from DrainCoordinator. The run_form_review parameter was removed from __init__, self._run_form_review removed from the instance, and the form review block in _phase_final_sweep was deleted. The lambda run_form_review=lambda: self._run_form_review(session_id) was removed from the DrainCoordinator constructor call in SessionManager.stop_session. The _run_form_review method in...

> **[amp]** Item 15: Extract EMBEDDING_DIM as shared constant **[APPROVED]**
> *Session: amp-opt-s016*
> Completed Item 15: Extracted EMBEDDING_DIM = 1536 constant from hardcoded values across the AMP codebase. Added to @amp/core/types.ts and replaced all production references in neo4j/schema.ts (2 vector indexes), code/schema.ts (1 vector index), mcp/bootstrap.ts (fallback embedding provider). Updated 5 test files to use the constant. Discovery D12: Found that all 7 workspace packages had their p...

> **[amp]** Item 14 - Fix silently swallowed errors across AMP codebase **[APPROVED]**
> *Session: amp-opt-s015*
> Completed Item 14: Added console.error logging to 14 silent catch blocks across 7 packages (code/indexer, core/import, retrieval/assembler, retrieval/deterministic, retrieval/intent, oni/store, wiki/viewer). Audited all 30 production files with catch statements. Classified 21 empty/comment-only catches into two categories: 14 that needed logging (error information was being discarded) and 7 tha...

> **[amp]** Item 13: Add Zod validation to extract.ts LLM responses **[APPROVED]**
> *Session: amp-optimizer-S014*
> Completed Item 13 — Zod validation for extract.ts. A previous session had already implemented and committed the code (362e063) but left the progress log incomplete. This session verified all 63 new tests pass (schema validation + mocked extractor), confirmed the full suite at 980 tests across 10 workspaces with 0 failures, and committed the session log entry (b7f15d9). The implementation replac...

> **[amp]** Item 12: Add path validation to amp_ingest and amp_compile **[APPROVED]**
> *Session: amp-opt-s013b*
> Completed Item 12 -- path validation for wiki tools. Added validatePath() and getAllowedBaseDir() to packages/wiki/src/tools.ts. Both amp_ingest (source_path) and amp_compile (output_dir) now validate that resolved paths are within the allowed base directory before calling into services. Uses AMP_INGEST_ALLOW_DIR env var with fallback to process.cwd(). The path.sep boundary check prevents prefi...

> **[amp]** Item 11 refinement: Harden arch/retrieval test mocks for robustness **[APPROVED]**
> *Session: amp-opt-S013*
> Rewrote 5 test files across arch and retrieval packages. Arch tools test uses service-level mocks verifying all 6 MCP tool dispatch paths. Retrieval tests cover feedback tracking (boost normalization, usage inference), deterministic assembly (entity scoping, token budgeting), unified assembler (strategy routing: GRAPH intent -> deterministic, ambiguous -> ranked), and tool registration. Key lea...

> **[amp]** Item 11: Add tests for untested arch/retrieval modules -- overlap session **[ABANDONED]**
> *Session: opt-s012-overlap*
> Attempted to work on Item 11 (arch/retrieval test suites) but discovered a concurrent session had already completed the work during this session's runtime. The concurrent session committed 3 times during my session: 47a44a2 (test suites), c959a35 (progress log), 733ce41 (test routing fixes). My analysis independently identified the same two bugs: (1) getEffectiveAspects query contains CONTAINS*...

> **[amp]** Item 11 — Add tests for untested arch/retrieval modules **[APPROVED]**
> *Session: amp-optimizer-s012*
> Completed Item 11: Added 88 new tests across arch and retrieval packages. Arch package went from 14 to 57 tests covering ArchContextBuilder (build, renderMarkdown, token budgeting), ImpactAnalyzer (blast radius, risk classification, aspect-based escalation), and all 6 arch MCP tool handlers. Retrieval package went from 56 to 102 tests covering DeterministicAssembler (entity matching, hierarchy/...

> **[amp]** Item 11 — Add tests for untested arch/retrieval modules **[APPROVED]**
> *Session: S012*
> Completed Item 11: Added test suites for previously untested arch and retrieval modules. Arch package went from 14 to 56 tests (+42) with new context.test.ts (8 tests, fixed truncated file from prior session), impact.test.ts (10 tests covering blast radius and risk levels), and tools.test.ts (24 tests from prior session). Retrieval package went from 56 to 102 tests (+46) with new feedback.test....

> **[amp]** Item 10: Add tests for research modules **[APPROVED]**
> *Session: amp-optimizer-s011*
> Verified and cleaned up Item 10 — research test suite. 124 new unit tests across 7 files covering all 6 research modules (campaign, experiment, hypothesis, consolidation, contradictions, context) plus schema. All tests use mocked Neo4j driver for isolation. Discovery D10: empty catch block in consolidation.ts createSemanticFromPattern fixed with error logging. Prior session had committed the wo...

> **[amp]** Item 10: Add tests for research modules **[APPROVED]**
> *Session: amp-optimizer-s011*
> Added 124 unit tests across 7 new test files for the research package, covering all 6 previously untested modules: campaign (16), experiment (32), hypothesis (18), consolidation (21), contradictions (14), context (15), and schema (8). All tests use mocked Neo4j driver for isolation from the live database. Key test areas: CampaignStore CRUD with Cypher injection defense, ExperimentStore dual-lab...

> **[scribo-v2]** Phase 3 Voice Pipeline — recording, transcription, LLM cleanup, paste **[APPROVED]**
> *Session: scribo-v2-phase3-2026-04-09*
> Completed Phase 3 Voice Pipeline.

Modules built:
- output.rs: Windows SendInput + clipboard paste (paste_text, undo_paste, send_tab, click_at). Safety blocklist blocks VK_RETURN/VK_BACK/VK_DELETE.
- pipelines.rs: Pure pipeline logic — detect_command() with 7 command types (Scratch, Enhance, Capture, Region, Fill, AddDictionary, SaveSnippet), detect_tone() mapping window titles to formality hin...

> **[scribo-v2]** Phase 2 Storage Layer — SQLite with history, snippets, dictionary **[APPROVED]**
> *Session: scribo-v2-phase1-2026-04-09*
> Completed Phase 2 Storage Layer.

Modules built:
- db.rs: Database wrapper with SQLite WAL mode, 4 tables (entries, metadata, dictionary, snippets)
- history.rs: CRUD for transcription history — add, get (with search/pagination), delete, clear, message count tracking
- snippets.rs: CRUD + match_trigger algorithm (longest-match-wins, normalizes input, increments use_count)
- dictionary.rs: CRUD...

> **[scribo-v2]** Phase 1 Foundation — scaffold Tauri v2 app with orb overlay, panel shell, config, state, events, hotkeys **[APPROVED]**
> *Session: scribo-v2-phase1-2026-04-09*
> Completed Phase 1 Foundation for Scribo v2 — a full rewrite of Scribo v1 (Python/Tkinter voice dictation app) as a Tauri v2 desktop app with Rust backend.

Key decisions and outcomes:
- Architecture: Rust-heavy backend (Approach A) — all v1 Python modules map 1:1 to Rust modules. Single binary, no Python dependency.
- Two-window system: 80x80 transparent orb overlay (always-on-top) + 372x620 fr...

> **[ap3x]** Phase 4a implementation — Electron shell + Vite migration **[APPROVED]**
> *Session: ap3x-phase4a-impl-2026-04-09*
> Completed Phase 4a. UI moved from root src/ to packages/ui/ with Vite (214KB bundle, builds in 690ms). packages/app/ is the Electron shell with boot(), system tray, close-to-tray. CRA artifacts deleted from root. Key issues resolved: (1) ESM/CJS boundary — packages use "type":"module" but Electron main is CJS. Fixed with Node16 module target in app tsconfig which preserves dynamic import() whil...

> **[amp]** Full build pipeline and configuration health audit of AMP monorepo on Cerebro **[APPROVED]**
> *Session: audit-build-pipeline-2026-04-09*
> Comprehensive audit of AMP monorepo build pipeline and configuration on Cerebro (2026-04-09).

BUILD PIPELINE: CRITICAL FAILURE. `npm run build` fails with TS5055 errors — stale .d.ts files in packages/core/dist/ are treated as inputs because the root tsconfig.json sets declarationMap:true and the composite build sees the dist/ output as overlapping. The fix is to either clean dist/ before buil...

> **[amp]** Full test suite audit across all packages **[APPROVED]**
> *Session: test-audit-2026-04-09*
> Test suite audit completed 2026-04-09. Key findings:

1. FAILING TESTS (2 total):
- packages/core/src/__tests__/promotion.test.ts: "applies decay to stale promoted nodes" — test expects old flat 5% decay (0.3 * 0.95 = 0.285) but temporal.ts was refactored to exponential decay (0.3 * 2^(-7/90) = 0.28425). Test needs updating to match new decay model.
- packages/oni/src/__tests__/store.regression...

> Implement Electron main.ts (Task 4) and update root package.json (Task 5) for Phase 4a **[APPROVED]**
> *Session: phase-4a-tasks-4-5-2026-04-08*
> Phase 4a Tasks 4 and 5 completed. Task 4: Created packages/app/src/main.ts implementing the Electron main process. Key design decision: @ap3x/server is pure ESM ("type": "module") while @ap3x/app is CommonJS ("type": "commonjs") for Electron. This ESM/CJS boundary required using dynamic import() — `const { boot } = await import('@ap3x/server')` — rather than a static import. The ServerHandle ty...

> Phase 4a Tasks 1-3: scaffold packages/ui/ (Vite+React), move App.jsx to App.tsx, scaffold packages/app/ (Electron shell) **[APPROVED]**
> *Session: phase-4a-tasks-1-3-2026-04-08*
> Implemented Phase 4a Tasks 1-3 on branch phase-1/monorepo-core-types.

Task 1 (scaffold packages/ui/): Created @ap3x/ui package with Vite 6 + React 18 + TypeScript. Config: strict:false (intentional — App.tsx has untyped mock data, Phase 4b enables strict). moduleResolution:Bundler, jsx:react-jsx, base:'./' for Electron file:// loading. pnpm install succeeded, 6 new workspace projects total.

T...

> **[ap3x]** Phase 4a design decisions for Electron shell + Vite migration **[APPROVED]**
> *Session: phase-4a-design-decisions-20260408*
> Phase 4a design decisions finalized:

Q1 Styling: Keep inline styles as-is, defer to Phase 4b. App.jsx is 1980 lines of inline styles -- changing the styling system while changing bundlers is unnecessary risk.

Q2 TypeScript: Keep .jsx with allowJs, defer TS conversion to Phase 4b. 20 useState hooks and dense render logic would require touching hundreds of lines just to satisfy the compiler.

Q...

> **[ap3x]** Phase 3 implementation of @ap3x/server — REST + SSE + scheduler + multi-company isolation **[APPROVED]**
> *Session: ap3x-phase3-impl-2026-04-09*
> Completed Phase 3 implementation of @ap3x/server. 18 commits, 73 total tests (12 test files), typecheck clean. Package exports boot(port, dbPath) → ServerHandle. Implementation includes: 10 Drizzle SQLite tables with indexes, 10 entity mappers, 6 repo modules (audit, companies, agents, threads, messages, tasks), 7 Hono route groups, SSE stream with 8 typed events, HeartbeatScheduler hook wiring...

> Tasks 16-17: @ap3x/server route integration tests and final verification **[APPROVED]**
> *Session: ap3x-phase3-tasks16-17-2026-04-08*
> Completed Tasks 16-17 of Phase 3 (@ap3x/server). Created route integration tests in packages/server/src/__tests__/routes/companies.test.ts (4 tests) and packages/server/src/__tests__/routes/agents.test.ts (4 tests). Tests use app.request() via Hono's built-in test helper — no HTTP server needed. createApp(db) accepts optional scheduler parameter so it works cleanly without a scheduler for route...

> **[ap3x]** Implement Tasks 11-15 of @ap3x/server: routes, SSE stream, scheduler wiring, boot/shutdown **[APPROVED]**
> *Session: phase3-tasks-11-15-2026-04-08*
> Implemented Tasks 11-15 of @ap3x/server package:

Task 11: Created app.ts (Hono factory with createApp), routes/companies.ts (CRUD + sub-route mounting), routes/agents.ts (CRUD + start/pause/terminate lifecycle), and stub files for threads, messages, tasks, audit, stream. Key fix: exactOptionalPropertyTypes required stripping undefined values from Zod-parsed objects before passing to repo funct...

> Implement Tasks 2-5 of @ap3x/server package **[APPROVED]**
> *Session: ap3x-server-tasks-2-5-2026-04-08*
> Implemented Tasks 2-5 of @ap3x/server in packages/server/src/. All 4 tasks typechecked clean and committed separately.

Task 2 (lib utilities): Created id.ts (nanoid prefix wrapper), errors.ts (AP3XError hierarchy + Hono errorHandler), validate.ts (Zod body parser), events.ts (EventEmitter bus with typed AP3XEventName), skills.ts (raw SQL fallback for skills lookup). Commit: b842606.

Task 3 (D...

> Scaffold @ap3x/server package with Hono + Drizzle + SQLite deps **[APPROVED]**
> *Session: ap3x-server-scaffold-20260408*
> Scaffolded @ap3x/server as the third workspace package. Created packages/server/package.json with deps: hono ^4.7.0, drizzle-orm ^0.39.0, better-sqlite3 ^11.0.0, nanoid ^5.1.0, zod ^3.24.0, and workspace refs to @ap3x/core and @ap3x/runtime. tsconfig.json extends tsconfig.base.json with composite:true and references to both core and runtime. Directory structure includes src/db, src/repos, src/r...

> **[ap3x]** Phase 3 design and implementation planning for @ap3x/server **[APPROVED]**
> *Session: ap3x-phase3-design-plan-2026-04-09*
> Completed Phase 3 design spec and implementation plan for @ap3x/server. Key architectural decisions: (1) In-process Hono server — boot(port, dbPath) with zero Electron imports, better-sqlite3 native bindings require single process. (2) Core types as source of truth — Drizzle schema is persistence representation, mapper layer bridges with TS drift detection. (3) Single SSE stream per company wit...

> **[ap3x]** Phase 2: Implement @ap3x/runtime package — prompt builder, parser, runner, ONI graph, scheduler **[APPROVED]**
> *Session: ap3x-phase2-runtime-2026-04-08*
> Completed Phase 2 implementation of @ap3x/runtime. All 8 tasks done: scaffold (prior session), types, TDD buildSystem prompt builder (9 tests), TDD parseAgentOutput parser (9 tests), run() API+CLI router, buildCompanyGraph ONI StateGraph, TDD HeartbeatScheduler (8 tests), barrel export. 34 total tests passing, typecheck clean. Key decisions: (1) ONI StateGraph requires Record<string,unknown> co...

> **[ap3x]** Phase 2 Task 1: Scaffold @ap3x/runtime package **[APPROVED]**
> *Session: phase2-task1-scaffold-runtime-20260408*
> Scaffolded @ap3x/runtime package at packages/runtime/. Created package.json with dependencies on @oni.bot/core ^1.2.0 and @ap3x/core workspace:*. tsconfig.json extends tsconfig.base.json with composite mode and references packages/core. Placeholder src/index.ts exports nothing yet. Updated root package.json typecheck script to include packages/runtime. pnpm install resolved successfully, typech...

> **[ap3x]** Phase 2 implementation plan created for @ap3x/runtime **[APPROVED]**
> *Session: ap3x-phase1-planning-2026-04-08*
> Wrote Phase 2 plan for @ap3x/runtime. Key discovery: ONI v1.2.0 has NO /processes subpath — the PRP's ProcessManager doesn't exist. Process management for CLIs (claude-code, codex, bash) must be built using Node.js child_process in @ap3x/runtime. ONI provides: StateGraph (graph construction), model adapters (anthropic/openai/ollama/openrouter with .chat({systemPrompt, messages}) → ChatResponse)...

> **[ap3x]** Phase 1 implementation complete — monorepo + @ap3x/core types **[APPROVED]**
> *Session: ap3x-phase1-planning-2026-04-08*
> Phase 1 fully implemented on branch phase-1/monorepo-core-types (7 commits, d343839..95d0a17). Deliverables: pnpm monorepo workspace, strict TypeScript config (ES2022, NodeNext, exactOptionalPropertyTypes), @ap3x/core package with 17 exported types + buildOrgTree() utility. Key decisions: used | null for nullable DB fields (not optional ?), added duplicate-ID guard to buildOrgTree, added "type"...

> **[ap3x]** Task 5: TDD buildOrgTree() - vitest config, tests, implementation **[APPROVED]**
> *Session: task5-buildorgtree-20260408*
> Completed Task 5: TDD buildOrgTree(). Created vitest.config.ts at repo root with glob pattern for packages/*/src/**/*.test.ts. Wrote 7 unit tests in packages/core/src/__tests__/org-tree.test.ts covering: empty input, single root, three-tier hierarchy (planner/manager/worker), multiple roots, orphan handling (reportsTo pointing to non-existent ID), multiple children under one parent, and inserti...

> **[tachi]** Task 4: Define all shared entity types for @ap3x/core **[APPROVED]**
> *Session: task4-shared-types-20260408*
> Completed Task 4 - defined all shared types in packages/core/src/types/. Created 6 type files (agent.ts, company.ts, thread.ts, task.ts, skill.ts, audit.ts), org-tree.ts stub with buildOrgTree function, and updated index.ts barrel export. All types map to the database schema with nullable DB columns typed as `| null`. Used `export type` syntax required by verbatimModuleSyntax and `.js` extensio...

> Scaffold @ap3x/core package - Task 3 of Phase 1 **[APPROVED]**
> *Session: task-3-scaffold-core*
> Completed Task 3: Successfully scaffolded the @ap3x/core monorepo package with full setup. Created directory structure (src/types, src/__tests__), package.json with exports config, tsconfig.json extending base config with composite mode, and placeholder index.ts. TypeScript build passed with exit code 0, generating declaration maps and source maps. All files committed to phase-1/monorepo-core-t...

> Create strict TypeScript base configuration (tsconfig.base.json) **[APPROVED]**
> *Session: ap3x-phase1-task2*
> Created tsconfig.base.json at repo root with strict compiler options: ES2022 target, NodeNext module system, exact optional types, no unchecked index access, no unused locals/parameters. This is the shared base config that will be extended by packages/core/tsconfig.json in Task 3 and other packages. Committed with "chore: add strict TypeScript base config".

> **[ap3x]** Task 1: Initialize pnpm monorepo workspace **[APPROVED]**
> *Session: phase1-task1-pnpm-monorepo-20260408*
> Converted from npm to pnpm monorepo. Created pnpm-workspace.yaml (packages/*), .npmrc (shamefully-hoist=true for CRA compat, strict-peer-dependencies=false). Updated root package.json: renamed to ap3x, added private:true, added typescript and vitest devDeps, added typecheck/test/test:watch scripts, added pnpm.onlyBuiltDependencies for electron/esbuild. Deleted package-lock.json, pnpm install cr...

> **[ap3x]** Created Phase 1 implementation plan from PRP document **[APPROVED]**
> *Session: ap3x-phase1-planning-2026-04-08*
> Read the full AP3X PRP (ap3x-prp-final.docx) and created a detailed Phase 1 implementation plan. The PRP defines an 8-phase build roadmap for an AI Agent Orchestration Platform built on @oni.bot/core v1.2.0. Current state: complete Teams-style React UI (monolithic 1980-line App.jsx with 3 mock agents), Electron shell, no backend/persistence. Phase 1 plan covers: pnpm monorepo setup, TypeScript...
