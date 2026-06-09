---
id: 28s5a0LJ08U2PQA4d0OOk
session_id: session-20260419-210828
agent_id: mcp
task: [project:ap3x-solana] Task 21: solana-portfolio applyLandedTrade + realized-pnl event
outcome: approved
created_at: "2026-04-20T04:08:56.280Z"
---

[project:ap3x-solana] Task 21 completed. Added applyLandedTrade to FilePortfolioStore with FIFO lot reduction and realized-pnl event emission. Key decisions: (1) PublicKey uses private class fields (#bytes) so structuredClone fails — used manual shallow clone for 'before' position snapshot. (2) Added private audit() method, _auditForTest now delegates to it. (3) Added Vitest alias in vitest.config.ts pointing @ap3x/solana-portfolio to src/index.ts to avoid needing a build step for integration tests. (4) Added explicit include for tests/**/*.test.ts in vitest config. (5) Exported FilePortfolioStore from src/index.ts. All 23 tests pass, 0 typecheck errors, 0 lint errors (7 pre-existing warnings in reconciler.test.ts).