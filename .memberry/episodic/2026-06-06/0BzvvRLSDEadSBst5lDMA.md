---
id: 0BzvvRLSDEadSBst5lDMA
session_id: session-20260605-graph-pr
agent_id: mcp
task: [project:amp] Implement the Minimal First PR for a new @amp/graph package (graph snapshot + report + amp_graph_report MCP tool), per docs/graphify-inspired-amp-enhancements.md hardened design.
outcome: approved
created_at: "2026-06-06T02:17:07.033Z"
---

[project:amp] Shipped the Minimal First PR for @amp/graph (new 10th workspace package). Scope held tightly to: Phase 0 scaffold, GraphSnapshotService, GraphReportService WITHOUT community detection, one MCP tool amp_graph_report under a new disabled `graph` domain, plus tests. Deferred (out of scope): community detection/GDS, export, PR impact, extra ingestion extractors.

Key implementation decisions, all driven by the doc's Hardening Verdict + 21-item Corrections Log (which override the older body text):
- Re-scoped report to be genuinely community-free: Core Abstractions = pure-TS weighted-degree over snapshot edges only (centrality.ts), no GDS, no centrality library. Dropped surprises.ts / "Surprising Connections" (depends on community detection). report.generate() never calls detect() and is side-effect-free (no persisted runs).
- Secret-safety lives at the snapshot boundary (allowlist.ts): per-node-type property ALLOWLIST (not denylist) + secret-pattern redaction + vector/forbidden-key drop. Symbol.signature/doc_comment, Semantic.content, embeddings, absolute Source.path never leak. A planted-secret-in-Symbol-signature test asserts it never appears in report output.
- Neo4j integer coercion (toNum in coerce.ts) applied to every count/property; LIMIT wrapped in neo4j.int(). Test asserts a coerced count is typeof number.
- Determinism: every snapshot query has total ORDER BY + per-query LIMIT, PLUS a final TS sort (nodes by id; edges by source,target,relation,id) after merging separate queries.
- Project scoping reconciled to ONE strategy: project-root by EXACT toLower name (never CONTAINS substring), delimiter-bounded repo path for Symbols/Components ("/name/"), tags for Semantics, project_tag for Sources/Facts/Episodics. include_episodes defaults false; max_nodes default 50000 with truncated/total_available.
- MCP registration required all 5 coordinated edits or the real drift guard (packages/mcp/src/__tests__/server.test.ts:72-89) fails: extend ToolDomain union, DOMAIN_TOOL_NAMES_MAP graph:['amp_graph_report'], DOMAIN_DESCRIPTIONS graph entry, GRAPH_TOOL_NAMES exported from @amp/graph + appended to server.ts toolNames, and NON-EMPTY ToolAnnotations ({readOnlyHint:true,idempotentHint:true}) — empty {} re-triggers the "typedHandler is not a function" SDK bug. Services injected via setGraphServiceInstances() singleton in bootstrap.ts (NOT registration args); initGraphSchema runs after initCodeSchema. graph domain disabled by default.
- Build wiring (Gotcha #2): tsconfig copies packages/code verbatim (composite/outDir dist/rootDir src), build is `tsc -b`, never bare tsc in src (stray src/*.js silently shadow .ts). graph added to BOTH root workspaces AND tsconfig.build.json references (before mcp). @amp/graph:* added to mcp deps. amp-graph-out/ gitignored.

Outcome: npm run build green; full suite green (1270 tests across 10 packages, 0 failures); drift guard passes; graph domain shows in amp_tools list and stays disabled by default. Tool/domain counts reconciled to 45 tools / 9 progressive-disclosure domains across README, CLAUDE.md.example, skills. Delivered as 5 small commits on branch graph-report.