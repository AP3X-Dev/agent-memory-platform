# AMP Hardening Handoff - 2026-05-29

Working repo on Cerebro: `/home/cerebro/projects/amp`

## Completed slice

- MCP `amp_store` now accepts and forwards scope metadata: `entities`, `model_id`, `scope`, and `tags`.
- Ranking now treats invalid or future timestamps as zero age instead of producing invalid scores.
- Token budgeting now skips oversized items and continues filling the remaining budget.
- Snapshot commits force-add the requested snapshot path so ignored `.amp` exports can be committed by the timer path.
- Snapshot commits now scope both the staged diff check and `git commit` pathspec to the requested snapshot path, preventing unrelated staged work from being swept into an automated snapshot commit.
- Build hygiene now removes package `dist` directories and package `*.tsbuildinfo` files before each root build.
- Package TypeScript configs exclude test files and `dist` output from production builds.
- Type gaps found by the clean build were repaired in consolidation, service, Neo4j mapping, extraction-provider typing, and MCP bootstrap invalidation.
- MCP SSE now exposes non-streaming health endpoints: unauthenticated `/healthz` for liveness and Bearer-authenticated `/readyz` for readiness.
- Context cache invalidation now tracks both tag and entity keys. New stores invalidate project/tag/entity caches, and background fact creation invalidates affected entity/tag caches.
- MCP shutdown now closes active SSE transports before waiting on the HTTP server and bounds shutdown waits with `AMP_SHUTDOWN_TIMEOUT_MS` / a 5s default.
- MCP now has a tested authenticated readiness-check command plus a systemd drop-in artifact at `deploy/systemd/amp-mcp-readyz.conf`; the live `amp-mcp.service` uses it as `ExecStartPost`.
- MCP readiness checks now abort hung HTTP attempts at the remaining overall deadline, preventing a stalled `/readyz` request from hanging service startup.
- Tier-1 MCP `amp_grep` now parameterizes pattern, regex, and scope values through `ScopedQuery.rawCypher` instead of interpolating user text into Cypher predicates.
- Tier-1 MCP `amp_grep` now normalizes direct-call limits before querying/counting results and advertises an integer, positive, max-50 schema limit.
- User-facing `amp_query` raw Cypher validation now rejects top-level administrative `SHOW` and `USE` commands, keeping the gateway focused on graph reads instead of database metadata exposure.
- User-facing `amp_query` raw Cypher execution now wraps read queries in an outer bounded subquery so a caller-provided large `LIMIT` cannot bypass AMP's requested result cap.
- User-facing `amp_query` no longer carries a stale MCP-side false positive for read-only `CALL {}` subqueries; raw query policy is delegated to `ScopedQuery.rawCypher`, which permits read-only subqueries and still rejects admin, mutating, and stored-procedure calls.
- Raw `amp_query` result limits are now capped centrally at 100 rows in `ScopedQuery.rawCypher`, and the MCP tool schema advertises the same upper bound.
- Ranked `amp_context` now derives `project:<name>` tag scope from `project_name` and merges it with explicit `tag_scope`, preventing cross-project memory bleed when callers use project-scoped context.
- Ranked architecture search now scopes `project_name` to the matching project entity or anything under its `CONTAINS` tree, preventing fulltext architecture results from crossing project boundaries.
- Deterministic graph retrieval now applies `project_name` to both fulltext entity matching and keyword fallback matching, using the same normalized project containment boundary.
- Direct `amp_arch_context` now exposes `project_name` scoping and applies the project containment boundary to target lookup, hierarchy, dependencies, dependents, aspects, and optional children.
- Direct `amp_impact` now exposes `project_name` scoping and applies the project containment boundary to direct dependents, transitive dependents, co-aspect entities, and affected aspects.
- Direct `amp_arch_drift` single-entity `check` and `mark_fresh` now accept `project_name` and apply the project containment boundary before reading file paths or updating stale/fresh state.
- Direct `amp_arch_aspect` entity-specific `apply`, `remove`, and `get` now accept `project_name` and apply the project containment boundary before mutating or listing aspect relationships.
- Direct `amp_arch_relate` now accepts `project_name` and applies the project containment boundary to both source and target entities before creating or removing structural relationships.
- Ranked retrieval fusion now applies a bounded provenance-quality multiplier: high-confidence, source-backed memories get a small boost, while invalidated or superseded results are demoted without being removed.
- Ranked code retrieval now forwards `project_name` as a code `file_path` scope, using the indexed source path as the available project boundary.
- Direct `amp_code_context` now exposes `language`, `file_path`, `kind`, and `project_name` scoping, forwarding filters into code search and deriving a code path scope from `project_name`.
- Direct `amp_code_search` now also exposes `project_name` scoping and maps it through the same code path scope helper, preserving explicit `file_path` precedence.
- Direct `amp_code_ast_grep` now exposes read-only ast-grep structural search for JavaScript, TypeScript, and TSX/JSX files, returning AST node ranges and meta-variable captures under the same project-root path confinement used by other code tools.
- Direct `amp_code_ast_grep` now skips oversized source files before reading/parsing them and exposes `max_file_bytes` so large generated or bundled source files do not dominate structural searches.
- Tree-sitter code indexing now emits `SYMBOL_CALLS` relations from parsed call expressions, giving `amp_code_deps` real caller/callee graph data instead of only storing symbols/imports/inheritance.
- Code relation resolution now passes parsed symbol name/kind/start-line fallbacks, so re-indexing unchanged files can add new relationship edges even when symbol writes are skipped by content hash and parser IDs are transient.
- Built `@amp/code` parser runtime now normalizes tree-sitter grammar module shapes, fixing `tree-sitter-typescript` ESM/CJS interop when loading `packages/code/dist/parser.js` directly.
- Direct `amp_code_deps` now exposes `file_path`, `project_name`, `kind`, and max-100 `limit` filters, and `SymbolStore` applies those filters/limits to caller, callee, importer, and inheritance queries so dependency answers stay project-local and bounded.
- Direct `amp_code_symbols` now uses a shared scoped lookup path with `name`, `file_path`, `project_name`, `kind`, and max-100 `limit`, preventing broad unbounded symbol dumps in multi-project code memory.
- Tree-sitter call graph extraction now filters `SYMBOL_CALLS` to local or imported callable names, reducing noisy builtin/property-chain edges such as `trim`, `push`, and `toUpperCase` from indexed code-memory graphs.
- Tree-sitter TypeScript/JavaScript symbol extraction now indexes const-assigned arrow functions and function expressions as callable symbols, preserving their call edges while avoiding bogus parameter or inner function-expression symbols.
- Tree-sitter TypeScript/JavaScript symbol extraction now indexes function-valued class fields as contained `method` symbols, so class property arrow/function methods keep their own call edges instead of attributing calls to the parent class.
- Tree-sitter TypeScript/JavaScript import extraction now also captures re-export statements (`export { x } from './y'`, `export * from './y'`, `export * as ns from './y'`) as `ImportInfo` module dependencies, so `resolveImports` records `SYMBOL_IMPORTS` edges for them. Local-only exports (`export { x }` with no `from`) and `export default <decl>` are deliberately excluded from import extraction. (2026-05-30)
- Pure barrel/re-export files that declare no symbols of their own (an `index.ts` that only re-exports, a Python `__init__.py` that only re-imports) now get a single synthetic `module` symbol anchor when `symbols.length === 0 && imports.length > 0`. Previously these files produced an `ImportInfo` but no `from:Symbol`, so `resolveImports` had nothing to hang the `SYMBOL_IMPORTS` edge on and the module dependency was silently dropped — a gap surfaced by the live MCP indexing smoke (Next Best Work item 2), not by parser unit tests. The `module` kind was already whitelisted in `resolveImports` for both endpoints, so this completes the existing design rather than adding new edge semantics. Files that already declare symbols are untouched. Verified end-to-end against live Neo4j: a `pure-barrel.ts` re-exporting from `target.ts` went from 0 `SYMBOL_IMPORTS` edges to 2 (`module` -> `targetFn`, `module` -> `TargetClass`), with the smoke graph cleaned to zero residue afterward. (2026-05-30)
- Automatic queued code re-indexing now applies the same supported-extension, excluded-directory, and test-file filters as filesystem watcher events, preventing stored memory mentions of generated, vendored, or test files from creating unnecessary index churn.
- Code lexical-vector search now honors the existing language, file path, and symbol kind filters instead of bypassing them during hybrid code search.
- Code file-path filters now compare case-insensitively in fulltext, dense-vector, and lexical-vector search paths.
- Filtered dense and lexical code vector searches now overfetch bounded candidate pools before applying post-filters, then cap returned matches to the requested limit.
- Semantic code-memory vector search now overfetches bounded candidate pools when an `as_of` temporal cutoff is active, preserving historical recall while keeping returned semantic matches capped.
- Code context token budgeting now skips oversized results and keeps later fitting symbols or semantic memories instead of aborting the whole context on the first oversized item.
- Ranked `amp_context` token budgeting now skips oversized fused results and keeps later fitting context items instead of aborting on the first oversized item.
- Deterministic graph retrieval section budgeting now skips oversized hierarchy/dependency/aspect/semantic items and keeps later fitting items.
- Architecture context budgeting now trims removable sections iteratively until the context fits the requested token budget when the preserved target entity allows it.
- Wiki portal generation is now more human-facing: duplicate project slugs are canonicalized before page generation, internal `__...` scopes are hidden from the portal and top-level recent/decision strips, empty projects without human-facing content are omitted from navigation, and project indexes link to the generated `_graph` pages.
- Wiki search now ranks obvious title/path/project-index matches above incidental body matches and supports `project=<slug>` filtering against cached project metadata.
- Wiki project indexes now surface the top high-confidence project decisions before raw entity lists, making project pages useful as a human starting point instead of only a graph-derived directory.
- Wiki search now falls back from exact-phrase matching to separated all-term matching, with per-term highlighting for multi-term queries whose words appear in different parts of a page.
- Wiki project/entity pages now render project breadcrumbs plus Project Home, Graph, and project-scoped search controls; filtered search pages now show the active project scope and a clear-filter path.
- Wiki compilation now honors `project_tag` for project-scoped compiles. The full portal remains the default, but `amp_compile(project_tag: "project:<name>")` and `wiki-cli compile --project project:<name>` now emit focused project pages, decisions, recent activity, topics, and source library content instead of every project.
- Wiki source-library and topic related-entity sections now emit project-scoped entity links instead of old flat root links, so browsing from topics/sources lands on the generated project pages.
- Wiki viewer sidebars now render wikilink headings as readable TOC labels and add matching heading anchors, so topic pages with project-link headings no longer show raw `[[...]]` syntax or dead section jumps.
- Retrieval now has a **quality** evaluation (not just the latency benchmark): `packages/retrieval/bench/quality-eval.ts` runs the real ranked pipeline (expandQuery → adaptiveWeights → rrfFusion + lexicalTextScore boost → MMR, mirroring `UnifiedAssembler.assembleRanked`) over a human-labeled golden set and reports Recall@k, Precision@k, MRR, nDCG@10, intent accuracy, and single-channel fusion lift. It is wired as a CI regression gate via `src/__tests__/quality.regression.test.ts` and runnable with `npm run -w @amp/retrieval bench:quality` (`--verbose` for per-query diagnostics). (2026-05-30, goal: "most effective agent memory layer")
- The quality harness immediately surfaced and drove two real ranking fixes: (1) `intent.ts` SEMANTIC patterns only matched a narrow slice of question phrasings (`how does`, `why is/does`); broadened to cover `how (do/does/did/is/are/can/should/to)`, `why (do/does/did/is/are/was/were)`, `what (is/are/does/do)`, plus `strategy`/`approach` cues — GRAPH patterns still take precedence so `what calls`/`what depends` stay GRAPH. Intent accuracy 0.818 → 1.000. (2) `scoring.ts` `lexicalTextScore` had a *dead* exact-name branch: callers pass decorated titles like `"validateToken (function)"`, so `name === token` never fired and every match collapsed to a flat `+2.0` substring nudge (incidental fragments scored the same as real matches). Rewrote it to strip the `(kind)` suffix, split identifiers into words, and score exact whole-name (+3.0) / exact identifier-word (+2.0) / weak substring (+0.6), plus a +2.0 full-identifier-reconstruction bonus when the query covers every word of a multi-word identifier. Exact identifier lookups (`validateToken`, `AuthService`) now rank the exact symbol #1; MRR 0.864 → 0.909, nDCG@10 0.849 → 0.882. The regression test also pins a core temporal-truth property — an invalidated/superseded memory (`sem-old-auth`) is demoted below current knowledge for the same query (the `provenanceQualityMultiplier` ×0.35 invalidation path), the "what is true now" guarantee. All 118 `@amp/retrieval` tests pass (was 114). NB: naive stopword filtering was tried to reduce function-word noise and reverted — English function words are common identifier morphemes (`getUserById`→`by`, `isValid`→`is`, `onClick`→`on`), so dropping them breaks identifier matching; the existing identifier-split test caught it.
- Retrieval quality iteration 2 (2026-05-30): de-saturated the golden set to 37 docs (distractors + a same-file `charge.ts` sibling cluster + a symbol-seeking "payment charge functions" query) so Recall@10 is no longer a trivial 1.0 and the eval discriminates. This exposed and fixed a real MMR defect: `scoring.ts` `fastSimilarity` returned a hard `1.0` similarity for two *distinct* symbols in the same file, so `mmrDiversify` evicted legitimately-relevant sibling functions in favor of weaker cross-file results. Softened to `SAME_FILE_MMR_SIM = 0.55` (identical name+file stays `1.0`); unit-proven by a new `scoring.test.ts` case ("keeps a strongly-relevant same-file sibling over a much weaker cross-file result"). `@amp/retrieval` 118 → 119 tests; `QUALITY_THRESHOLDS` re-baselined to the harder 37-doc set (nDCG@10 ≥ 0.82, the eval got more discriminating, not the system worse). The de-saturation also surfaced the next target (recorded, not yet fixed): provenance-boosted semantic prose outranks exact symbols for symbol-seeking queries — needs idf-aware lexical weighting and/or source-type-intent, not provenance-magnitude fishing.
- Retrieval quality iteration 3 (2026-05-30) — the biggest ranking fix so far: **`mmrDiversify` was ignoring relevance entirely.** It combined raw RRF relevance (tiny absolute values, ~0.01–0.04) with the [0,1] similarity term, so the diversity penalty `(1-λ)·maxSim` (~0.165) dwarfed `λ·relevance` (~0.028) and MMR degenerated into near-pure diversity sorting for EVERY query. Fix: min-max normalize relevance to [0,1] within `mmrDiversify` before combining (standard MMR practice). Diagnosed via the de-saturated harness: the channels ranked the charge siblings 1–4 yet fusion buried them at 6–8. After the fix, "payment charge functions" Recall@5 went 0.25 → 1.00 and aggregate Recall@5 0.819 → 0.882, nDCG@10 0.835 → 0.854 (37-doc set). Two smaller fixes ride along, each ablation-justified against the harness: (a) `inferSourceTypeBoost` — an explicit "…functions/class/method" query adds a +0.25 Symbol source-type boost (merged into the existing `boosts.source_type_boosts` already applied in `rrfFusion`); ablation showed +0.02 nDCG, charge R@5 0.75 → 1.00. (b) `SAME_FILE_MMR_SIM = 0.55` (distinct same-file symbols are a redundancy *signal*, not duplicates), a relevance/diversity trade that lifts Recall@5/nDCG and the sibling-cluster case for a small Recall@10 cost — the right call for agent memory, which reads the top results. The old `penalizes same-file results` unit test (which encoded the buggy diversity-dominant behavior) was rewritten to demonstrate the penalty correctly under balanced MMR; new regression tests pin the charge-cluster Recall@5 and the discriminating sibling-retention case. `@amp/retrieval` 119 → 120 tests; `QUALITY_THRESHOLDS` nDCG@10 raised back to 0.85.

- Consolidation learning-path fix (2026-05-30): reinforcement signals were DECAYING confidence instead of raising it. In `ConsolidationEngine._generateProposals`, a signal cluster with only reinforcements (no corrections/contradictions) called `buildDecayProposal` (`confidence × 0.95`) — the comment even said "bump confidence gently" while the code lowered it. So a semantic memory that was repeatedly confirmed (i.e. the most-validated knowledge) lost 5% confidence every consolidation cycle — backwards for a memory layer. Added a `reinforce` `ProposalType` + `buildReinforceProposal` that raises confidence gently with diminishing returns toward 1.0 (`c + (1-c)·0.05`, bounded ≤ 1); `_applyProposal` handles `reinforce` via the same `updateConfidence` path as `decay`. The queue-only temporal-decay path (unsignaled nodes) still decays, correctly. Two GDS tests that asserted the old buggy `type: 'decay'` for reinforcement clusters were corrected to `reinforce`, and a new `consolidation.test.ts` case pins that reinforcement raises (never lowers) confidence and stays bounded. `@amp/core` 204 → 205 tests; full workspace green.

- Retrieval quality — conflict/knowledge-update dimension (2026-05-30): reframed the eval toward agent-relevant memory quality (not just IR recall). Added `runConflictEval()` to `quality-eval.ts` measuring the property that decides whether memory helps or hurts an agent: with a CURRENT and a SUPERSEDED fact on one topic (incl. the canonical Jest→Vitest case, plus deploy-command and auth examples), does the layer rank current above stale and keep stale out of the top context? Metrics `currentAboveStaleRate` (gate 1.0) and `staleLeakRate` top-3 (gate 0.0); AMP passes both via the `provenanceQualityMultiplier` ×0.35 invalidation demotion. Wired into the gate + a new `quality.regression.test.ts` case (maps to MemoryAgentBench conflict-resolution / LongMemEval knowledge-update). `@amp/retrieval` 120 → 121; `QUALITY_THRESHOLDS.ndcgAt10` re-baselined 0.85 → 0.84 for the 3 added conflict distractor docs (bigger/harder set, not a regression).

- MemBench — system-agnostic agent-memory benchmark (2026-05-30, user-directed): new `bench/membench/` scores ANY memory system through a thin `MemorySystemAdapter` contract (`reset/remember/recall`) on five agent-relevant dimensions (recall, precision, conflict/knowledge-update, stale-resistance, cross-project contamination), each normalized to [0,1] with a composite. Run `npx tsx bench/membench/run.ts`. Ships three reference adapters — NaiveRecency, Keyword(BM25), and AMP (real `rrfFusion` + current-mode invalidation exclusion + project scoping). Result: **AMP 1.000, Keyword 0.733, NaiveRecency 0.450** — AMP's lead is exactly on the agent-specific dimensions a lexical memory ignores (conflict, stale, contamination). Regression-gated by `packages/retrieval/src/__tests__/membench.regression.test.ts` (AMP must beat both baselines; `@amp/retrieval` 121 → 122). MemBench surfaced and drove a core fix: `provenanceQualityMultiplier` invalidation demotion hardened from ×0.35 (clamped at a 0.25 floor) to ×0.15 with a 0.05 floor, so superseded items in the ranked path fall out of the top context instead of merely down within it; the AMP adapter additionally models current-mode EXCLUSION of invalidated facts (what `getActive` does). Honesty caveat recorded: AMP scoring 1.0 validates architectural coverage, not saturation — v0.1 needs harder scenarios (implicit/inferred conflicts, partial staleness, multi-hop, noisy contamination, cost budgets) to create headroom and a fair external-system (Zep/Letta) comparison.

- MemBench v0.2 (2026-05-30): hardened the MemBench quality benchmark (`bench/membench/`) with `implicit-conflict-inference` (newer fact supersedes older with NO stale flag — must be inferred) and `multi-hop-recall`. Implicit conflict is resolved via `supersededByNewerDuplicate` (demote an older item only when a NEWER same-subject near-duplicate exists, Jaccard ≥ 0.4) — a faithful proxy for AMP's fact layer (`findBySubjectPredicate` → invalidate-old-on-different-object), keeping multi-hop recall intact. Scores: AMP 1.0, Keyword 0.683, NaiveRecency 0.367. `@amp/retrieval` tests green; full workspace green.


- Temporal-truth fix in `rankFacts` (2026-05-30, `packages/core/src/ranking.ts`): the fact ranker only penalized `disputed` (×0.5) and gave `invalidated` and `tentative` facts ×1.0 — same as `active`. In historical/interval/evolution temporal modes `getActive` returns non-active facts, so a superseded fact could rank alongside the current truth. Replaced the single check with a per-status multiplier (`active 1.0 > tentative 0.7 > disputed 0.5 > invalidated 0.15`), so current truth always outranks superseded/tentative facts (even when the stale one has higher raw confidence). Two new `ranking.temporal.test.ts` regressions pin the ordering. `@amp/core` 205 → 207; full workspace green.

- EntityResolver whitespace fragmentation fix (2026-05-30, `packages/neo4j/src/entity-resolver.ts`): the resolver canonicalizes by exact → case-insensitive (`toLower`) → alias, but never trimmed input, so `"auth-module"` and `" auth-module "` resolved to DIFFERENT entities — the exact fragmentation the resolver exists to prevent (both the exact `{name:$text}` and `toLower` matches are whitespace-sensitive). Added `text = text.trim()` at the top of `resolve()` and `resolveExisting()` so surrounding whitespace no longer fragments entities and trimmed names are persisted on create. Two new `entity-resolver.test.ts` regressions. `@amp/neo4j` 148 → 150; full workspace green.

- MemoryBlockService.promote stale-copy fix (2026-05-30, `packages/core/src/blocks.ts`): Redis blocks are keyed `amp:block:{scope}[:{sessionId}]:{name}`. Promoting a working block to core strips `session_id` (changing the key) and writes the new core entry, but never deleted the old session-scoped entry — so a stale pre-promotion copy lingered, and `read(scope,name,sessionId)`/`list` would surface the OLD block instead of the promoted one. Added a delete of the original session-scoped key after the core write. New `blocks.test.ts` regression. `@amp/core` 207 → 208; full workspace green.

- DriftDetector.checkAll cross-project contamination fix (2026-05-30, `packages/arch/src/drift.ts`): entities were fetched scoped to the project (`(proj)-[:CONTAINS*0..]->(e)`), but the batch stale-flag update was `MATCH (e:Entity) WHERE e.name IN $names SET e.stale = true` — names aren't unique across projects, so a same-named entity in ANOTHER project got wrongly marked stale. Now collects entity IDs and updates `WHERE e.id IN $ids`. New `drift.regression.test.ts` case. `@amp/arch` 55 → 56; full workspace green.

## Verification

Commands run on Cerebro from `/home/cerebro/projects/amp`:

```bash
npm run build && npm test
npm test
npm test --workspace @amp/mcp -- src/__tests__/readyz-check.test.ts
npm test --workspace @amp/mcp -- src/__tests__/readyz-check.test.ts -t 'aborts a hung'
npm test --workspace @amp/mcp
npm test --workspace @amp/mcp -- src/__tests__/tools.test.ts -t 'parameterizes pattern'
npm test --workspace @amp/mcp -- src/__tests__/tools.test.ts -t 'normalizes fractional and invalid direct-call limits'
npm test --workspace @amp/mcp -- src/__tests__/tools.test.ts -t 'allows read-only CALL subqueries'
npm test --workspace @amp/mcp -- src/__tests__/tools.test.ts
npm test --workspace @amp/neo4j -- src/__tests__/query.regression.test.ts
npm test --workspace @amp/neo4j -- src/__tests__/query.regression.test.ts -t 'enforces the caller limit'
npm test --workspace @amp/neo4j -- src/__tests__/query.regression.test.ts -t 'caps oversized caller limits'
npm test --workspace @amp/neo4j -- src/__tests__/validate-cypher.test.ts -t 'SHOW administrative'
npm test --workspace @amp/neo4j -- src/__tests__/validate-cypher.test.ts
npm test --workspace @amp/core
npm test --workspace @amp/core -- src/__tests__/cli.regression.test.ts
npm test --workspace @amp/retrieval
npm test --workspace @amp/retrieval -- src/__tests__/scoring.test.ts src/__tests__/fusion.test.ts -t 'provenance|invalidated'
npm test --workspace @amp/retrieval -- src/__tests__/assembler.test.ts -t 'project_name to ranked code search'
npm test --workspace @amp/code -- src/__tests__/context-budget.test.ts src/__tests__/tools.regression.test.ts
npm test --workspace @amp/code -- src/__tests__/tools.regression.test.ts
npm test --workspace @amp/code -- src/__tests__/structural-search.test.ts
npm test --workspace @amp/code -- src/__tests__/tools.regression.test.ts -t 'amp_code_ast_grep'
npm test --workspace @amp/code -- src/__tests__/structural-search.test.ts -t 'skips files larger'
npm test --workspace @amp/code -- src/__tests__/tools.regression.test.ts -t 'max_file_bytes'
npm test --workspace @amp/code -- src/__tests__/parser.calls.test.ts
npm test --workspace @amp/code -- src/__tests__/parser.assigned-functions.test.ts
npm test --workspace @amp/code -- src/__tests__/parser.assigned-functions.test.ts src/__tests__/parser.calls.test.ts
npm test --workspace @amp/code -- src/__tests__/parser.class-fields.test.ts
npm test --workspace @amp/code -- src/__tests__/parser.class-fields.test.ts src/__tests__/parser.assigned-functions.test.ts src/__tests__/parser.calls.test.ts
npm test --workspace @amp/code -- src/__tests__/indexer.relations.test.ts
npm test --workspace @amp/code -- src/__tests__/indexer.relations.test.ts src/__tests__/parser.calls.test.ts
npm test --workspace @amp/code -- src/__tests__/tools.deps.test.ts
npm test --workspace @amp/code -- src/__tests__/symbol-identity.test.ts -t 'scopes and bounds dependency queries'
npm test --workspace @amp/code -- src/__tests__/tools.deps.test.ts src/__tests__/symbol-identity.test.ts -t 'amp_code_deps|scopes and bounds dependency queries'
npm test --workspace @amp/code -- src/__tests__/tools.symbols.test.ts
npm test --workspace @amp/code -- src/__tests__/symbol-identity.test.ts -t 'scopes and bounds symbol lookup'
npm test --workspace @amp/code -- src/__tests__/tools.symbols.test.ts src/__tests__/symbol-identity.test.ts -t 'amp_code_symbols|scopes and bounds symbol lookup'
npm test --workspace @amp/code -- src/__tests__/watcher.test.ts -t 'queueReindex ignores excluded|queueReindex ignores test|queueReindex accepts test'
npm test --workspace @amp/code -- src/__tests__/watcher.test.ts
npm run build --workspace @amp/code
npm test --workspace @amp/code -- src/__tests__/structural-search.test.ts src/__tests__/tools.regression.test.ts
npm test --workspace @amp/arch -- src/__tests__/context.test.ts src/__tests__/tools.regression.test.ts src/__tests__/project-scope.regression.test.ts
npm test --workspace @amp/arch -- src/__tests__/impact.test.ts src/__tests__/tools.regression.test.ts
npm test --workspace @amp/arch -- src/__tests__/drift.regression.test.ts src/__tests__/tools.regression.test.ts
npm test --workspace @amp/arch -- src/__tests__/project-scope.regression.test.ts src/__tests__/tools.regression.test.ts
npm test --workspace @amp/arch -- src/__tests__/relation-store.regression.test.ts src/__tests__/tools.regression.test.ts
npm test --workspace @amp/code -- src/__tests__/search.language-filter.test.ts -t 'case-insensitive'
npm test --workspace @amp/retrieval -- src/__tests__/assembler.test.ts -t 'scopes ranked architecture search'
npm test --workspace @amp/retrieval -- src/__tests__/deterministic.test.ts -t 'scopes'
npm test --workspace @amp/code
npm test --workspace @amp/code -- src/__tests__/search.language-filter.test.ts -t 'applies language, path, and kind filters to lexical vector results'
npm test --workspace @amp/code -- src/__tests__/search.language-filter.test.ts -t 'overfetches'
npm test --workspace @amp/code -- src/__tests__/search.language-filter.test.ts -t 'overfetches semantic'
npm test --workspace @amp/code -- src/__tests__/context-budget.test.ts
npm test --workspace @amp/retrieval -- src/__tests__/assembler.test.ts -t 'skips oversized ranked results'
npm test --workspace @amp/retrieval -- src/__tests__/deterministic.test.ts -t 'skips oversized section items'
npm test --workspace @amp/arch
npm test --workspace @amp/arch -- src/__tests__/context.test.ts -t 'continues trimming removable sections'
npm test --workspace @amp/wiki -- src/__tests__/renderers.test.ts src/__tests__/compile.test.ts
npm test --workspace @amp/wiki -- src/__tests__/renderers.test.ts
npm test --workspace @amp/wiki -- src/__tests__/viewer.test.ts
npm test --workspace @amp/wiki -- src/__tests__/viewer.test.ts -t 'project breadcrumbs|filtered search pages'
npm test --workspace @amp/wiki -- src/__tests__/viewer.test.ts -t 'renders topic sidebar headings'
npm test --workspace @amp/wiki -- src/__tests__/viewer-render.test.ts
npm test --workspace @amp/wiki -- src/__tests__/compile.test.ts -t 'honors project scope'
npm test --workspace @amp/wiki -- src/__tests__/compile.test.ts
npm test --workspace @amp/wiki -- src/__tests__/renderers.test.ts -t 'links related topic entities|links source claims'
npm test --workspace @amp/wiki -- src/__tests__/renderers.test.ts
npm test --workspace @amp/wiki
npm test --workspace @amp/mcp -- src/__tests__/bootstrap.regression.test.ts
npm test --workspace @amp/mcp
npm run build
npm run build && npm test
npm exec tsx packages/wiki/src/cli.ts compile --output /home/cerebro/projects/amp/wiki
systemd-run --wait --pipe --collect -p WorkingDirectory=/home/cerebro/projects/amp -p EnvironmentFile=/etc/amp/env /usr/bin/npx tsx packages/wiki/src/cli.ts compile --output /tmp/amp-wiki-scope-smoke --project project:amp
```

Results:

- Repeated build passed.
- Full workspace test suite passed.
- Passing test counts from the final run: core 204 passed / 3 skipped, neo4j 148 passed, redis 65 passed, mcp 96 passed / 7 skipped, research 138 passed, arch 55 passed, code 90 passed, retrieval 114 passed, wiki 235 passed / 1 skipped.
- Focused core package run passed: 204 passed / 3 skipped.
- Focused retrieval package run passed: 114 passed.
- Focused code package run passed: 90 passed.
- Focused arch package run passed: 55 passed.
- Focused MCP package run passed: 96 passed / 7 skipped.
- Focused Neo4j package run passed: 148 passed.
- Focused wiki package run passed: 235 passed / 1 skipped.
- Current wiki UI freshness re-check passed on Cerebro after the live refresh: `npm test --workspace @amp/wiki` reported 10 test files passed and 235 tests passed / 1 skipped.
- The new MCP readiness-check tests were first verified RED against the missing module, then GREEN after adding authenticated retry logic with sanitized failures.
- The new hung-readiness-request test was first verified RED by timing out against a non-abortable fetch, then GREEN after adding per-attempt `AbortController` deadlines.
- The new `amp_grep` parameterization test was first verified RED against inline escaped Cypher literals, then GREEN after routing pattern, regex, and scope values through `$grep...` parameters.
- The new `amp_grep` limit-normalization test was first verified RED against fractional direct-call limits returning too many matches, then GREEN after flooring finite positive values and falling back to the default for invalid values.
- The new `ScopedQuery.rawCypher` parameter forwarding regression test passed after extending `rawCypher` to pass optional params through to Neo4j `session.run`.
- The new raw-Cypher administrative-command test was first verified RED against `SHOW USERS` being accepted, then GREEN after blocking top-level `SHOW` and `USE`.
- The new raw-Cypher non-bypassable-limit test was first verified RED against an inner `LIMIT 1000000` being passed straight through, then GREEN after wrapping reads in an outer `RETURN * LIMIT <caller limit>` subquery.
- The new MCP `amp_query` `CALL {}` test was first verified RED against the stale MCP-side blocklist, then GREEN after delegating raw query validation to `ScopedQuery.rawCypher`.
- The new raw-Cypher oversized-limit cap test was first verified RED against `RETURN * LIMIT 1000000`, then GREEN after clamping raw query limits to 100.
- The new snapshot pathscope test was first verified RED against whole-index diff/commit behavior, then GREEN after scoping both operations to `snapshotPath`.
- The new provenance ranking tests were first verified RED against missing/unused provenance weighting, then GREEN after applying bounded provenance quality before normalization/MMR.
- The new ranked code project-scope test was first verified RED against missing `file_path` forwarding, then GREEN after deriving a code path scope from `project_name`.
- The new direct code-context scope tests were first verified RED against missing `buildContext` filter forwarding and missing MCP tool args, then GREEN after adding filtered `amp_code_context` scoping.
- The new direct code-search project scope test was first verified RED against missing `amp_code_search` `project_name` support, then GREEN after routing direct search through `buildCodePathScope`.
- The new structural code-search test was first verified RED against a missing `structural-search` module, then GREEN after adding an `@ast-grep/napi` runner that returns typed AST matches and captures.
- The new direct ast-grep tool exposure test was first verified RED against missing `amp_code_ast_grep` registration, then GREEN after registering the read-only MCP tool and adding it to code tool listings.
- The new ast-grep oversized-file test was first verified RED against scanning both normal and oversized files, then GREEN after checking file size before reading source.
- The new direct ast-grep `max_file_bytes` exposure test was first verified RED against missing MCP schema/forwarding, then GREEN after adding the parameter and forwarding it to structural search.
- The new tree-sitter call-relation parser test was first verified RED against `parseFile()` returning no `SYMBOL_CALLS`, then GREEN after extracting call expressions under the current parent symbol.
- The new indexer relation-fallback test was first verified RED against relation resolution receiving only transient parser IDs, then GREEN after passing stable parsed symbol name/kind/start-line fallback metadata.
- A built-runtime parser smoke first failed with `TypeError: Invalid language object` when importing `packages/code/dist/parser.js`, then passed after normalizing tree-sitter grammar module shapes.
- The call-graph noise filter test was first verified RED against `trim`/`toUpperCase` builtin/property-chain calls being emitted, then GREEN after post-filtering call relations to parsed local symbols and imported callable names.
- The new assigned-function parser test was first verified RED against const-assigned function expressions being indexed as `variable` symbols, then GREEN after treating `function_expression` initializers as callable values and ignoring them as standalone extracted symbols.
- The new class-field parser test was first verified RED against class property arrow methods being absent from parsed symbols, then GREEN after extracting function-valued class fields as contained `method` symbols with their own `SYMBOL_CALLS` edges.
- The new scoped dependency-query tests were first verified RED against `amp_code_deps` forwarding only the symbol name and `SymbolStore.getCallers()` lacking filter/limit clauses, then GREEN after adding shared dependency options and bounded Cypher filters.
- The new scoped symbol-lookup tests were first verified RED against `amp_code_symbols` still taking the exact-file/global-name branch and `SymbolStore` lacking `findSymbols()`, then GREEN after adding a shared bounded symbol lookup path.
- The new queued re-index filter tests were first verified RED against `queueReindex()` accepting excluded directories and test files, then GREEN after sharing path eligibility checks between queued re-indexing and filesystem watcher events.
- The new direct architecture-context project scope tests were first verified RED against missing `project_name` forwarding and unscoped arch Cypher, then GREEN after adding project containment filters through the arch context path.
- The new direct impact project scope tests were first verified RED against missing `project_name` forwarding and unscoped blast-radius Cypher, then GREEN after adding project containment filters to all impact result groups.
- The new direct drift project scope tests were first verified RED against missing `project_name` forwarding and unscoped single-entity drift Cypher, then GREEN after scoping freshness checks and stale/fresh updates.
- The new direct aspect project scope tests were first verified RED against missing `project_name` forwarding and unscoped aspect-entity Cypher, then GREEN after scoping aspect apply/remove/get operations.
- The new structural relation project scope tests were first verified RED against missing `project_name` forwarding and unscoped relation Cypher, then GREEN after scoping source and target entity matching.
- The two new case-insensitive code path filter tests were first verified RED against case-sensitive matching, then GREEN after normalizing path comparisons.
- The new architecture scope test was first verified RED against the old query, then GREEN after adding the project containment filter.
- The two new deterministic project scope tests were first verified RED against the old queries, then GREEN after adding fulltext and fallback project filters.
- The new lexical code-search filter test was first verified RED against the old lexical path, then GREEN after forwarding and applying filters.
- The two new filtered code-vector overfetch tests were first verified RED against the old direct-limit query parameters, then GREEN after adding bounded candidate overfetch and result capping.
- The new semantic temporal overfetch test was first verified RED against the old direct semantic limit, then GREEN after adding bounded temporal overfetch and semantic result capping.
- The new code-context budget test was first verified RED against the old break-on-oversize loop, then GREEN after switching to skip-and-continue.
- The new ranked `amp_context` budget test was first verified RED against the old break-on-oversize grouping loop, then GREEN after switching to skip-and-continue.
- The new deterministic section budget test was first verified RED against the old break-on-oversize section helper, then GREEN after switching to skip-and-continue.
- The new architecture context budget test was first verified RED against fixed-size trimming that still exceeded budget, then GREEN after adding iterative trimming.
- The new wiki human-navigation tests were first verified RED against duplicate project rows, internal smoke-scope leakage, and a broken `graph` link, then GREEN after canonicalizing projects, filtering internal scopes from the portal, and linking to `_graph`.
- The new wiki search usability tests were first verified RED against filesystem-order search results and ignored `project=` filters, then GREEN after caching title/path/project metadata, scoring title/path/index matches, and filtering by project slug.
- The new project-index decision-summary test was first verified RED against project pages that jumped straight to entity lists, then GREEN after rendering top high-confidence project decisions ahead of entity groups.
- The new multi-term wiki search test was first verified RED against exact-phrase-only matching, then GREEN after adding tokenized all-term fallback and per-term highlighting.
- The new wiki page-orientation tests were first verified RED against missing project breadcrumbs and missing filtered-search context, then GREEN after adding project page context controls and visible project filter state.
- The new project-scoped compile test was first verified RED against `compile(..., "project:alpha")` still emitting alpha and beta output, then GREEN after filtering projects, semantics, recent activity, topics, and sources by project scope and passing the MCP `project_tag` through the bootstrap adapter.
- The new source/topic entity-link tests were first verified RED against flat `[[entity|Entity]]` links in library and topic pages, then GREEN after deriving project-scoped links from source project tags and topic semantic project scopes.
- The new viewer TOC test was first verified RED against raw wikilink syntax in topic sidebars and missing rendered heading ids, then GREEN after deriving readable heading labels and matching anchors from the same heading text.
- Live Neo4j Cypher smokes passed for the ranked architecture project filter query and the deterministic fulltext/fallback project filter queries.
- Live wiki compile passed with service credentials: 19 projects, 154 articles, 970 episodic references, 2 library pages, 16 topic pages, and 3 cross-project pages.
- Live wiki output checks passed: portal no longer contains `__boot_smoke__`, duplicate `ap3x-solana` / `AP3X-Solana` and `fugazi` / `Fugazi` rows are canonicalized, and generated project indexes link to `_graph`.
- Live wiki search checks passed: `/search?q=amp-wiki` returns the `projects/amp/amp-wiki` page as the first result, and `/search?q=pure%20TypeScript&project=oni-core` returns one filtered hit.
- Live project-index check passed: `/wiki/projects/amp/_index` now renders a `Key Decisions` section before concepts/modules and still links to `_graph`.
- Live multi-term wiki search check passed: `/search?q=wiki%20timer` returned `200` with 6 hits and highlighted separated `wiki` / `timer` terms in snippets.
- Live project page orientation check passed: `/wiki/projects/amp/amp-wiki` returned `200` and rendered `PORTAL / amp / amp-wiki`, Project Home, Graph, and `project=amp` search controls.
- Live filtered-search orientation check passed: `/search?q=wiki&project=amp` returned `200` with 4 hits, rendered `PROJECT: amp`, and included a clear link to `/search?q=wiki`.
- Live project-scoped compile smoke passed through systemd with `/etc/amp/env`: `--project project:amp` compiled 1 project, 4 articles, 5 episodic references, 5 topic pages, and no non-AMP project indexes; `/tmp/amp-wiki-scope-smoke/projects` contained only `amp/_index.md`.
- Live wiki link-shape check passed: regenerated `wiki/library` and `wiki/topics` pages no longer contain flat root entity wikilinks and now include project-scoped entity links such as `[[projects/agent-assist-cr/sopregistry|SOPRegistry]]`.
- Live rendered UI check passed: `/wiki/topics/concurrency` now renders sidebar links such as `href="#agent-assist-cr"` and matching `<h2 id="agent-assist-cr">` sections, contains no raw `[[...]]` markup, and project-scoped links like `/wiki/projects/agent-assist-cr/sopregistry` return `200`.
- Latest live wiki UI refresh check passed after restarting `amp-wiki.service`: `/wiki/topics/concurrency`, `/wiki/projects/amp/_index`, `/search?q=wiki&project=amp`, and `/wiki/projects/agent-assist-cr/sopregistry` returned `200`; the concurrency page still renders `href="#agent-assist-cr"` plus `<h2 id="agent-assist-cr">` and contains no raw `[[...]]` markup.
- Current live wiki UI freshness check passed after restarting `amp-wiki.service`: `_index`, `projects/amp/amp-wiki`, filtered search, `topics/concurrency`, `projects/agent-assist-cr/sopregistry`, and `projects/amp/_graph` returned `200`; project pages rendered breadcrumbs, Graph, and `project=amp` search controls; filtered search rendered `PROJECT: amp`; `topics/concurrency` rendered matching `href="#agent-assist-cr"` / `<h2 id="agent-assist-cr">` anchors and no raw `[[...]]`; the portal still contained no `__boot_smoke__` references.
- Live raw-query smoke passed through systemd credentials: `ScopedQuery.rawCypher("CALL { MATCH (n:Semantic) RETURN n LIMIT 1 } RETURN n", 2)` returned `{ "ok": true, "rows": 1 }`.
- Live oversized-limit smoke passed through systemd credentials: `ScopedQuery.rawCypher("UNWIND range(1, 150) AS n RETURN n", 1000000)` returned exactly 100 rows, with first row 1 and last row 100.
- Direct structural-search runtime smoke passed against built output: searching `packages/code/src/tools.ts` for the identifier `structuralSearch` scanned 1 file and returned 2 AST matches.
- Direct oversized-file runtime smoke passed against built output: searching `packages/code/src/tools.ts` with `max_file_bytes: 1` scanned 0 files, skipped 1 file, returned 0 matches, and reported 0 errors.
- Direct built-parser runtime smoke passed against built output after call filtering: parsing `packages/code/src/tools.ts` through `packages/code/dist/parser.js` found 36 symbols and 15 filtered candidate `SYMBOL_CALLS` relations, down from the earlier noisy 226-call run while preserving local/imported calls such as `textContent`, `buildCodePathScope`, and `structuralSearch`.
- Direct built-parser assigned-function smoke passed against built output: parsing a temporary TypeScript file through `packages/code/dist/parser.js` produced `helper`, `normalize`, and `buildRunner` as `function` symbols and emitted `normalize -> helper` plus `buildRunner -> normalize` `SYMBOL_CALLS` edges.
- Direct built-parser class-field smoke passed against built output: parsing a temporary TypeScript class through `packages/code/dist/parser.js` produced `persist:function`, `Worker:class`, `run:method`, and `format:method`, with two containment edges and two `persist` call edges from the class-field methods.
- Expected live-store integration skips remained when test process env pointed at unauthenticated local Neo4j/Redis.

## Runtime state

- `amp-mcp.service` was restarted and is active on Cerebro.
- The service is listening on port `3101`.
- A restart smoke with an active `/sse` client restarted cleanly in 6 seconds; the SSE client exited and no force kill was needed on the new shutdown path.
- Unauthenticated `/sse` returned `401`, confirming the auth gate is active.
- Unauthenticated `/healthz` returned `200`.
- Unauthenticated `/readyz` returned `401`.
- Token-authenticated `/readyz` returned `200` using the running service process token; the token was not printed.
- The live systemd unit now includes `/etc/systemd/system/amp-mcp.service.d/readyz.conf`, sourced from `deploy/systemd/amp-mcp-readyz.conf`.
- `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` ran during restart and exited with status `0`.
- Token-authenticated `/sse` was not verified because `/etc/amp/env` is root-protected.
- `amp-snapshot.service` may still show the previous failed state until the next timer run or a privileged `systemctl reset-failed`; the CLI path now uses `git add -f` and commits only the requested snapshot path.
- The snapshot service was not manually started during this hardening pass because it intentionally creates a git commit, and no explicit commit approval was given.
- After the structural relation project-scope update, `amp-mcp.service` was restarted again and is active with main PID `963293`.
- After the ast-grep structural search update, `amp-mcp.service` was restarted again and is active with main PID `1053096`; unauthenticated `/healthz` returned `200`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the `amp_grep` parameterization update, `amp-mcp.service` was restarted again and is active with main PID `1070612`; unauthenticated `/healthz` returned `200`, unauthenticated `/readyz` returned `401`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the raw-Cypher administrative-command validation update, `amp-mcp.service` was restarted again and is active with main PID `1081405`; unauthenticated `/healthz` returned `200`, unauthenticated `/readyz` returned `401`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the ast-grep oversized-file guard update, `amp-mcp.service` was restarted again and is active with main PID `1095673`; unauthenticated `/healthz` returned `200`, unauthenticated `/readyz` returned `401`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the raw-Cypher non-bypassable limit update, `amp-mcp.service` was restarted again and is active with main PID `1107996`; unauthenticated `/healthz` returned `200`, unauthenticated `/readyz` returned `401`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the wiki human-navigation update, `amp-wiki.service` was restarted again and is active with main PID `985463`.
- `amp-wiki.service` `ExecStartPre` compiled the live wiki successfully during restart: 19 projects, 154 articles, 970 episodic references, 2 library pages, 16 topic pages, and 3 cross-project pages.
- Runtime wiki checks returned `200` for `/wiki/_index` and `/wiki/projects/amp/_graph`; the rendered portal returned zero `__boot_smoke__` references.
- After the ranked/project-filtered search update, `amp-wiki.service` was restarted again and is active with main PID `996769`.
- After the project-index decision-summary update, `amp-wiki.service` was restarted again and is active with main PID `1006356`.
- After the multi-term wiki search update, `amp-wiki.service` was restarted again and is active with main PID `1024354`.
- After the project page-orientation update, `amp-wiki.service` was restarted again and is active with main PID `1128663`; `ExecStartPre` compiled 19 projects, 154 articles, 970 episodic references, 2 library pages, 16 topic pages, and 3 cross-project pages.
- After the project-scoped compile update, `amp-wiki.service` was restarted again and is active with main PID `1151868`; `ExecStartPre` compiled the full portal successfully: 19 projects, 154 articles, 970 episodic references, 2 library pages, 16 topic pages, and 3 cross-project pages. `amp-mcp.service` was restarted again and is active with main PID `1151506`; unauthenticated `/healthz` returned `200`, unauthenticated `/readyz` returned `401`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the queued code re-index filter update, `amp-mcp.service` was restarted again and is active with main PID `1167184`; unauthenticated `/healthz` returned `200`, unauthenticated `/readyz` returned `401`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the wiki source/topic link update, `amp-wiki.service` was restarted again and is active with main PID `1183484`; `ExecStartPre` compiled the full portal successfully: 19 projects, 154 articles, 970 episodic references, 2 library pages, 16 topic pages, and 3 cross-project pages. Runtime checks returned `200` for `/wiki/_index` and `/wiki/topics/_index`.
- After the wiki viewer TOC update, `amp-wiki.service` was restarted again and is active with main PID `1203979`; `ExecStartPre` compiled the full portal successfully: 19 projects, 154 articles, 970 episodic references, 2 library pages, 16 topic pages, and 3 cross-project pages. Runtime checks returned `200` for `/wiki/topics/concurrency`, `/wiki/projects/amp/_index`, and `/search?q=wiki&project=amp`.
- After the MCP `amp_query` `CALL {}` delegation update, `amp-mcp.service` was restarted again and is active with main PID `1221082`; unauthenticated `/healthz` returned `200`, unauthenticated `/readyz` returned `401`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the raw-Cypher oversized-limit cap update, `amp-mcp.service` was restarted again and is active with main PID `1241347`; unauthenticated `/healthz` returned `200`, unauthenticated `/readyz` returned `401`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the `amp_grep` limit-normalization update, `amp-mcp.service` was restarted again and is active with main PID `1258740`; unauthenticated `/healthz` returned `200`, unauthenticated `/readyz` returned `401`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the latest wiki UI refresh, `amp-wiki.service` was restarted again and is active with main PID `1259159`; runtime checks returned `200` for `/wiki/topics/concurrency`, `/wiki/projects/amp/_index`, `/search?q=wiki&project=amp`, and `/wiki/projects/agent-assist-cr/sopregistry`.
- After the current wiki UI freshness refresh, `amp-wiki.service` was restarted again and is active with main PID `1370953`; `ExecStartPre` compiled the full portal successfully: 19 projects, 154 articles, 970 episodic references, 2 library pages, 16 topic pages, and 3 cross-project pages.
- After the tree-sitter call-graph indexing update, `amp-mcp.service` was restarted again and is active with main PID `1295189`; unauthenticated `/healthz` returned `200`, unauthenticated `/readyz` returned `401`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the scoped `amp_code_deps` update, `amp-mcp.service` was restarted again and is active with main PID `1317062`; unauthenticated `/healthz` returned `200`, unauthenticated `/readyz` returned `401`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the scoped `amp_code_symbols` update, `amp-mcp.service` was restarted again and is active with main PID `1334846`; unauthenticated `/healthz` returned `200`, unauthenticated `/readyz` returned `401`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the call-graph noise filter update, `amp-mcp.service` was restarted again and is active with main PID `1349377`; unauthenticated `/healthz` returned `200`, unauthenticated `/readyz` returned `401`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the assigned-function parser update, `amp-mcp.service` was restarted again and is active with main PID `1392537`; unauthenticated `/healthz` returned `200`, unauthenticated `/readyz` returned `401`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the class-field parser update, `amp-mcp.service` was restarted again and is active with main PID `1413218`; unauthenticated `/healthz` returned `200`, unauthenticated `/readyz` returned `401`, and `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.
- After the re-export import-extraction update, `amp-mcp.service` was restarted again and is active with main PID `3540411`; unauthenticated `/healthz` returned `200` and unauthenticated `/readyz` returned `401`. A built-runtime smoke against `packages/code/dist/parser.js` captured `./a` and `./b` from `export {…} from`/`export *` statements while excluding a local-only `export { plainLocal }`.
- After the pure-barrel module-anchor update, `amp-mcp.service` was restarted again and is active with main PID `3577963`; unauthenticated `/healthz` returned `200` and unauthenticated `/readyz` returned `401`. Before the restart, the fix was validated end-to-end against the live Neo4j graph via a standalone Node smoke driving the freshly-built `packages/code/dist` `CodeIndexer` (no service restart needed for that smoke, so the session MCP read link stayed alive): a `pure-barrel.ts` re-exporting from `target.ts` produced a `module` anchor symbol and 2 `SYMBOL_IMPORTS` edges (`module` -> `targetFn`, `module` -> `TargetClass`) where it previously produced none, and the smoke graph was cleaned to zero residue. Note: `amp_store` failed this session with `typedHandler is not a function` even before any restart (reads worked), so the durable record is these docs + git, not AMP episodic memory.

## Remaining high-value work

- Verify the snapshot timer after the next scheduled run, or reset/run it only with explicit approval for the service-created snapshot commit.
- Audit whether any stdio MCP processes from older sessions are still useful; they will not pick up code changes until restarted.
- Continue hardening retrieval behavior with live query evidence and any remaining architecture/code scope edge cases found in real graph data.
