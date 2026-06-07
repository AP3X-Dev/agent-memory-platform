---
id: W4E0KiVfpCnIuW8mBl3UV
session_id: session-20260502-graph3d3
agent_id: mcp
task: [project:fugazi] Phase 3d.3 module graph construction (T091-T094)
outcome: approved
created_at: "2026-05-02T12:58:43.137Z"
---

[project:fugazi] Phase 3d.3 lands in packages/graph: types.ts (FileNode, Edge, EdgeKind, Graph), build.ts (buildGraph), edge-kinds.ts (classifyEdgeKind). Key design choices: (1) Re-exports produce 'static' edges at the graph layer — re-export semantics are propagated in Phase 3d.4, the graph just records the resolution edge. (2) Unresolvable + external + resolved-but-not-in-project-set imports all collapse to to=ROOT_FILE_ID with resolvable=false. (3) Edges sorted by (from, to, kind, specifier) using bare comparators — never localeCompare, NFR-1 / SC-15 determinism. (4) edgesByTarget Map insertion order is numeric to-id-major via a secondary sort + Set-dedup pass, so callers iterating Map.keys() walk targets ascending. (5) 'side-effect' EdgeKind is reachable only via a future visitor extension (Inventory.Import doesn't expose specifier-binding info today); test for it is it.skip with note. (6) Visitor's resolvable=false flag short-circuits resolve() — dynamic template-literal imports don't probe the FS. Tests: 13 buildGraph + 8 classifyEdgeKind (1 skip) — 21 new cases. All baseline gates green: bun run build && typecheck && lint && test && forbidden-strings && forbidden-fallow-env && verify-wasm all exit 0.