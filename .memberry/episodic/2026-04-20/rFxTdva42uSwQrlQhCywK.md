---
id: rFxTdva42uSwQrlQhCywK
session_id: session-20260419-202005
agent_id: mcp
task: [project:ap3x-solana] Task 11: E2E fixture replay integration test for @ap3x/solana-signals
outcome: approved
created_at: "2026-04-20T03:20:23.055Z"
---

[project:ap3x-solana] Completed Task 11 (final Phase A task): added packages/solana-signals/tests/e2e-fixture.test.ts wiring FixtureSignalSource → SignalQueue → FileSignalCheckpointStore. Key deviation from template: SignalQueue.dispatch() fires the last handler via a void-dispatch inside push(), so drain() can exit (buffer empty) while the last handler's async ckpt.save() is still in-flight. Fixed by (1) collecting signals into array then pushing sequentially with await, and (2) collecting save promises from the subscriber handler and awaiting Promise.all(savePromises) after drain(). The handler returns the save promise so dispatch() awaits it correctly. Test passes: 50 signals delivered, no dupes, checkpoint persisted as id49/slot 149. Committed as da49c6c.