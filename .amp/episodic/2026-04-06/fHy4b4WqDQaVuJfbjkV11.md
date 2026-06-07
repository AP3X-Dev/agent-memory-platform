---
id: fHy4b4WqDQaVuJfbjkV11
session_id: task3-semantic-decay-methods-2026-04-05
agent_id: mcp
task: Add findStalePromoted and updateDecayClass to SemanticStore in packages/neo4j/src/semantic.ts
outcome: approved
created_at: "2026-04-06T01:14:57.379Z"
---

[project:amp] Task 3 completed on branch feat/promotion-engine. Added two new methods to SemanticStore in packages/neo4j/src/semantic.ts: findStalePromoted(cutoffDate) queries Semantic nodes with PROMOTED_FROM relationships to Episodic nodes where updated_at is older than the cutoff; updateDecayClass(id, decayClass) sets the decay_class field and updates updated_at. Import updated to include StalePromotedNode from @amp/core. Tests added to semantic.test.ts covering: stale node returned on 7-day cutoff, fresh node excluded on 30-day cutoff, and decay_class mutation with reset verification. All 12 tests pass against live Neo4j. Key challenge: writing TypeScript files with backtick template literals and dollar-sign Cypher parameters via SSH required using Python remote exec with chr() escaping. Committed as feat(neo4j): add findStalePromoted and updateDecayClass to SemanticStore (5a6abc2).