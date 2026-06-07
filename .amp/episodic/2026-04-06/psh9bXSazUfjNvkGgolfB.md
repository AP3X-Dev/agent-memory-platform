---
id: psh9bXSazUfjNvkGgolfB
session_id: task1-promotion-types-2026-04-05
agent_id: mcp
task: Add promotion types to @amp/core packages/core/src/types.ts
outcome: approved
created_at: "2026-04-06T00:43:00.624Z"
---

[project:amp] Task 1 of the Promotion Engine build completed. Added PromotionConfig, EpisodeClusterItem, EntityCluster, SessionCluster, OrphanedEntityEpisode, and StalePromotedNode interfaces to packages/core/src/types.ts after RECENCY_DECAY_DAYS. Added promotion: PromotionConfig field to AMPConfig interface. Updated makeConfig() helpers in all 5 affected test files (service.test.ts, consolidation.test.ts, consolidation-bug0008.test.ts, service.regression.test.ts, consolidation.regression.test.ts). All 87 tests passed. Committed as b0a5033 on feat/promotion-engine branch. Project lives on Cerebro server at 192.168.0.25 under ~/projects/amp. Vitest is run from packages/core directory (not root) since --project flag is not supported.