---
id: NlhHHZHtK1TblPOW7BXQs
session_id: session-20260419-001308
agent_id: mcp
task: [project:ap3x-solana] Fix StrategyRuntime.deregister() queue drain bug
outcome: approved
created_at: "2026-04-20T07:13:38.286Z"
---

[project:ap3x-solana] Fixed a runtime bug in @ap3x/solana-strategy where StrategyRuntime.deregister() would immediately remove the instance record without waiting for in-flight queue tasks (e.g. onSignal dispatches) to complete when no onShutdown hook was defined. The fix adds an unconditional no-op enqueue as a drain barrier before the conditional onShutdown enqueue. Regression test added as Test 9b. All 117 tests pass, typecheck clean, lint clean (no new warnings). Committed as c548f2e on branch prp-02-solana-runtime.