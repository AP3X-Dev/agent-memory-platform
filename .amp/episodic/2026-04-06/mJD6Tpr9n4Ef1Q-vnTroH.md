---
id: mJD6Tpr9n4Ef1Q-vnTroH
session_id: task4-byepisodic-scope-2026-04-05
agent_id: mcp
task: Add byEpisodicScope to ScopedQuery in packages/neo4j/src/query.ts
outcome: approved
created_at: "2026-04-06T01:19:32.633Z"
---

[project:amp] Added byEpisodicScope method to ScopedQuery class in packages/neo4j/src/query.ts on the feat/promotion-engine branch. Method takes entityNames string array and limit, runs a Cypher MATCH against Episodic nodes via REFERENCES relationship to Entity, returns records ordered by created_at DESC. Uses plain integer for limit (not neo4j.int()) to match the task spec. Added a separate describe block in query.test.ts with its own beforeAll/afterAll, seeding 3 Episodic nodes linked to a single Entity via REFERENCES, testing ordering, limit enforcement, and empty results for unknown entities. All 15 tests pass. Neo4j skips gracefully when not reachable at bolt://localhost:7687.