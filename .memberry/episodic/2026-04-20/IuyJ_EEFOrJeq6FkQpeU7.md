---
id: IuyJ_EEFOrJeq6FkQpeU7
session_id: session-20260419-120000
agent_id: mcp
task: [project:ap3x-solana] T49: authored docs/runtime-architecture.md — PRP-02 runtime architecture documentation with 5 Mermaid sequence diagrams and design invariants
outcome: approved
created_at: "2026-04-20T08:32:33.645Z"
---

[project:ap3x-solana] Completed T49: created docs/runtime-architecture.md (657 lines, commit 950d560). Document covers: (1) live signal→strategy→executor→portfolio flow, (2) cold-start cost-basis reconstruction 4-step algorithm, (3) backtest harness substitution points and gate-6 determinism, (4) executor failover+retry with BUMP_PROGRESSION and InFlightMap dedup, (5) portfolio drift detection and reconciliation. Design invariants documented: onError is synchronous void (must not await), intentId is base58(sha256(signalId NUL strategyName NUL instanceId NUL decisionVersion)) with NUL separator load-bearing, resolveWallet seam not vault:Vault, per-instance InstanceQueue serializes executor.submit alongside hook calls, BundleAccumulator is non-blocking 50ms/5-intent window. All diagrams verified against actual source before writing.