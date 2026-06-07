---
id: 6m2W8HfSgRZqmDSWbfFww
session_id: task10-wire-bootstrap-20260405
agent_id: mcp
task: [project:amp] Task 10: Wire PromotionScanner in bootstrap.ts
outcome: approved
created_at: "2026-04-06T01:45:04.767Z"
---

[project:amp] Completed Task 10 of the promotion engine feature. Wired PromotionScanner into packages/mcp/src/bootstrap.ts with all 6 changes: (1) Added PromotionScanner import from @amp/core, (2) Added promotion config block to AMPConfig with enabled=true, intervalMs=300000, minEpisodes=3, minSessions=2, coldStartEnabled=true, scoreThreshold=3, (3) Expanded ConsolidationEngine neo4j wiring to include promoteFromEpisodic and linkToEntity via explicit method delegation, (4) Expanded AMPService neo4j query wiring to include byEpisodicScope via explicit delegation to ScopedQuery, (5) Added PromotionScanner instantiation with setInterval scheduler (runs every 5 minutes on 'global' scope), (6) Updated shutdown handler to clearInterval on promotionTimer. Also fixed 3 test files (consolidation-bug0008.test.ts, consolidation.regression.test.ts, consolidation.test.ts) where mock semantic objects were missing the new promoteFromEpisodic and linkToEntity methods added to ConsolidationNeo4jLayer in Task 6. Clean build confirmed with zero errors.