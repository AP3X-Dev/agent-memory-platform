---
id: 8QBZBhn6MFBSbRAy7bpS2
session_id: promotion-scanner-task5-20260405
agent_id: mcp
task: [project:amp] Task 5: Build PromotionScanner class with entity clustering, cross-session convergence, cold-start orphans, and neglect decay passes
outcome: approved
created_at: "2026-04-06T01:25:11.991Z"
---

[project:amp] Implemented PromotionScanner in packages/core/src/promotion.ts. The scanner uses dependency injection via PromotionRedisLayer and PromotionNeo4jLayer interfaces (not direct imports of stores). It runs four passes: (1) entity clustering from findClustersByEntity, (2) cross-session convergence from findCrossSessionPatterns, (3) cold-start orphan promotion from findOrphanedEntities (gated by config.promotion.coldStartEnabled), and (4) neglect decay on stale semantic nodes. Entity deduplication via promotedEntityIds Set prevents duplicate proposals across passes. Scoring formula: (sessionCount * 2) + (approvedCount * 3) + recencyBonus. Decay applies 0.95 multiplier and marks nodes volatile when confidence drops below 0.1. All 10 unit tests pass with mocked dependencies using vitest vi.fn().