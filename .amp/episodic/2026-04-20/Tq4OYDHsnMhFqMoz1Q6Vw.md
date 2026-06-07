---
id: Tq4OYDHsnMhFqMoz1Q6Vw
session_id: session-20260419-225500
agent_id: mcp
task: [project:ap3x-solana] T38: implement InstanceQueue per-instance dispatch queue in @ap3x/solana-strategy
outcome: approved
created_at: "2026-04-20T05:55:19.586Z"
---

[project:ap3x-solana] T38 complete. Added InstanceQueue to packages/solana-strategy/src/instance-queue.ts. The class uses a private promise chain (this.chain) to enforce strict FIFO serialization. The try/catch inside the .then callback is load-bearing: it isolates task errors so only the individual caller's promise rejects, leaving the chain alive for subsequent tasks. Signature widened to () => Promise<T> | T to accept sync tasks at zero overhead (await on a non-thenable returns it directly). Four tests: FIFO serialization with concurrent enqueues, return value plumbing, error propagation + chain survival, sync task support. Exported from src/index.ts. Committed as b5e1bb4. Lint clean (pre-existing filter.test.ts warning only, zero errors).