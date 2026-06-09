---
id: VKlNAT6cNg3a_u_jjkt7y
session_id: amp-opt-S013
agent_id: mcp
task: [project:amp] Item 11 refinement: Harden arch/retrieval test mocks for robustness
outcome: approved
created_at: "2026-04-09T11:57:59.854Z"
---

[project:amp] Rewrote 5 test files across arch and retrieval packages. Arch tools test uses service-level mocks verifying all 6 MCP tool dispatch paths. Retrieval tests cover feedback tracking (boost normalization, usage inference), deterministic assembly (entity scoping, token budgeting), unified assembler (strategy routing: GRAPH intent -> deterministic, ambiguous -> ranked), and tool registration. Key learning: query-matching mocks are fragile for Neo4j testing because Cypher queries share substrings (Entity, CONTAINS, Aspect) across store methods. Service-level mocks that inject mock implementations are more robust. Also discovered stale untracked path-validation.test.ts from another session causing intermittent wiki failures. Full suite: 917 tests, 0 failures.