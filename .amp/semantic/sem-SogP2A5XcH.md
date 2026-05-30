---
id: sem-SogP2A5XcH
confidence: 0.7
signal_count: 0
decay_class: stable
tags:
  - project:ap3x-core
  - agent-runtime
created_at: "2026-04-20T14:10:03.256Z"
updated_at: "2026-04-20T14:10:03.256Z"
---

AP3X-Solana packages/solana-signals/src/signal-queue.ts and solana-strategy/src/runtime.ts dispatchSignal implement per-instance serialization with dedup TTL; StreamingGraph generalizes this