---
id: wxfvBr5Q31SyCTAOWzKKJ
session_id: amp-opt-s016
agent_id: mcp
task: [project:amp] Item 15: Extract EMBEDDING_DIM as shared constant
outcome: approved
created_at: "2026-04-09T12:40:39.280Z"
---

[project:amp] Completed Item 15: Extracted EMBEDDING_DIM = 1536 constant from hardcoded values across the AMP codebase. Added to @amp/core/types.ts and replaced all production references in neo4j/schema.ts (2 vector indexes), code/schema.ts (1 vector index), mcp/bootstrap.ts (fallback embedding provider). Updated 5 test files to use the constant. Discovery D12: Found that all 7 workspace packages had their package.json exports.import condition silently reverted from ./src/index.ts to ./dist/index.js (item 5 regression caused by item 13 commit 362e063). This broke cross-package vitest resolution when dist/ does not exist. Fixed by restoring exports and adding resolve.conditions: ['default'] to vitest configs. This also fixed 3 pre-existing test failures in core/integration.test.ts, neo4j/schema.test.ts, and mcp/server.test.ts that were invisible because they only manifested on master (not on the feature branches where tests were written).