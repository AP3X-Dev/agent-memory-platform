---
id: w1xl2-YUGY41U1Bcmq54O
session_id: session-20260419-195300
agent_id: mcp
task: [project:ap3x-solana] Task 5 PRP-02: Implement SignalQueue in @ap3x/solana-signals
outcome: approved
created_at: "2026-04-20T02:53:23.677Z"
---

[project:ap3x-solana] Implemented SignalQueue in packages/solana-signals/src/signal-queue.ts. Bounded in-memory queue extending EventEmitter with configurable capacity (default 10k), dedup window LRU (default 5k entries), and dedup TTL (default 10min). Uses Map insertion-order for O(1) LRU eviction of dedup entries. Reentrancy guard via dispatching flag prevents recursive dispatch when a subscriber handler triggers push. drain() is a test utility that loops until buffer empty. Overflow drops oldest item from front and emits overflow event with count. All 4 tests pass. Exported from index.ts. Committed at 1da6883.