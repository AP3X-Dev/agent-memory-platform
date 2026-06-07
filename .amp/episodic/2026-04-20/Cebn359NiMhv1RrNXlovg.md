---
id: Cebn359NiMhv1RrNXlovg
session_id: session-20260419-200210
agent_id: mcp
task: [project:ap3x-solana] Task 8 PRP-02: FixtureSignalSource in @ap3x/solana-signals
outcome: approved
created_at: "2026-04-20T03:02:46.990Z"
---

[project:ap3x-solana] Implemented FixtureSignalSource in packages/solana-signals/src/sources/fixture.ts. Key decision: start() must await the full readline loop (so abort test sees count after loop exits), but emit 'end' via setImmediate so callers can register 'end' listeners after awaiting start() — this resolves the test contract where test 1 does `await src.start()` then `src.on('end', ...)`. Aborted sources skip the 'end' emit entirely. The parseSignal method rehydrates programId and raw.programId from base58 strings to PublicKey instances. All 13 package tests pass.