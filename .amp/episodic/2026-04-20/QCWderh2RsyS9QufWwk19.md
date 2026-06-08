---
id: QCWderh2RsyS9QufWwk19
session_id: session-20260419-234600
agent_id: mcp
task: [project:ap3x-solana] T43 runBacktest harness implementation
outcome: approved
created_at: "2026-04-20T06:46:22.112Z"
---

[project:ap3x-solana] Implemented T43 runBacktest harness in packages/solana-strategy/src/backtest.ts. Key decisions:
- SimulatedExecutor uses mulberry32 PRNG seeded at 0 per run; no Date.now/Math.random anywhere
- InstrumentedStrategy only installs optional hook overrides when inner strategy defines them — this was critical for gate-6 determinism. If onExecutionResult/onPositionChange/onTick are unconditionally installed, the runtime dispatches them and consumes clock() ticks in unpredictable async order, breaking determinism.
- intentToTrade callback (Option C) for portfolio mutation — harness doesn't inspect opaque instructions
- tickIntervalMs: 2_147_483_647 to prevent tick timer firing (MAX_SAFE_INTEGER overflows to 1ms in Node.js)
- InMemoryPortfolio with inline FIFO lot accounting mirrors FilePortfolioStore without disk I/O
- reduceLots NOT imported from @ap3x/solana-portfolio (not in public API) — replicated inline
- RpcPoolLike imported from landed-trade-adapter.ts not runtime.ts (not re-exported)
- Gate-6 determinism achieved: 7/7 tests pass including byte-identical log comparison
- Commit SHA: b770946