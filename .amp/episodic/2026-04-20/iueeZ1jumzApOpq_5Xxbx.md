---
id: iueeZ1jumzApOpq_5Xxbx
session_id: session-20260419-232800
agent_id: mcp
task: [project:ap3x-solana] T42 StrategyRuntime orchestrator implementation
outcome: approved
created_at: "2026-04-20T06:28:23.618Z"
---

[project:ap3x-solana] Implemented T42 StrategyRuntime in packages/solana-strategy/src/runtime.ts. Key decisions: (1) resolveWallet seam used instead of vault: Vault — matches Phase C executor pattern. (2) executor.submit runs INSIDE the per-instance InstanceQueue callback alongside hook calls — Advisor note 4 / gate-6 determinism, prevents concurrent intentId collisions. (3) ExecutorLike and PortfolioLike narrow interfaces defined inline in runtime.ts for T43 backtest substitution. (4) priceSource handled with exactOptionalPropertyTypes-safe spread pattern. (5) onError wrapped in try/catch to swallow reporter errors. (6) tripGuard is idempotent and does NOT call deregister — instance stays in map for metrics attribution. All 5 carryover corrections applied. 17 tests, all pass. Commit: e032792.