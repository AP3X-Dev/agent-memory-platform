---
id: Xy3-NP_0v7ArT57wxgBJM
session_id: task6-promote-consolidation-engine
agent_id: mcp
task: Add promote case to ConsolidationEngine (Task 6)
outcome: approved
created_at: "2026-04-06T01:28:32.085Z"
---

[project:amp] Task 6 complete. Expanded ConsolidationNeo4jLayer interface with promoteFromEpisodic(episodicId, newNode) and linkToEntity(semanticId, entityId). Added 'promote' case to _applyProposal in ConsolidationEngine: builds SemanticNode from proposal.after, calls promoteFromEpisodic with primary episodic ID, conditionally calls linkToEntity if entity_id is in proposal.before, then invalidates cache. Updated makeNeo4j mock in consolidation.test.ts with the two new vi.fn() stubs. Added two promote tests: one with entity linking, one without. All 99 core tests pass. Committed on feat/promotion-engine as 41968db.