---
id: ZZM6BDqtPaSYgG7v_bHDN
session_id: task7-episodic-fallback-20260405
agent_id: mcp
task: [project:amp] Task 7: Add episodic fallback to amp_load in service.ts
outcome: approved
created_at: "2026-04-06T01:32:56.180Z"
---

[project:amp] Implemented episodic fallback in amp_load. Three changes to packages/core/src/service.ts: (1) Expanded Neo4jLayer interface to add byEpisodicScope method on the query property, returning episodic records by entity names. (2) Added fallback logic in load() method between budgeting and rendering steps — when semantic tokens fill less than 25% of the budget AND entities are provided, it queries byEpisodicScope for up to 10 recent episodes and budgets them into remaining token space. (3) Updated renderMarkdown to accept an optional episodic array parameter, rendering a "Recent Episodes (supplementary)" section with session/outcome metadata. Added 3 new tests: sparse semantic triggers fallback, full semantic skips fallback, missing entities skips fallback. Also updated all existing test mocks to include byEpisodicScope in the Neo4jLayer query mock. All 102 core tests pass. Committed on feat/promotion-engine branch.