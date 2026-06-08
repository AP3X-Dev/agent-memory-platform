---
id: AY0Dkxbj5kXK-JJOVgqnt
session_id: session-20260419-204417
agent_id: mcp
task: [project:ap3x-solana] Task 14: solana-portfolio accounting helpers FIFO/LIFO/avg-cost
outcome: approved
created_at: "2026-04-20T03:44:42.792Z"
---

[project:ap3x-solana] Implemented reduceLots() in packages/solana-portfolio/src/accounting.ts. Key design decision: per-lot proceeds allocation uses `proceeds * tokensTaken / max(lot.amount, totalSaleAmount)` — not a straight proportional split. This handles two cases: (1) partial-lot sale (lot > sale amount) scales proceeds down by the fraction of the lot consumed; (2) multi-lot sale (sale > any individual lot) allocates proportionally to total sale amount. avg-cost path uses standard weighted average: (totalBasis * amount) / totalAmt. All BigInt, no Number mixing. basisUnresolved flag propagates from any consumed lot. Input arrays never mutated. 5/5 tests pass, typecheck and lint clean. Commit: 3f91013.