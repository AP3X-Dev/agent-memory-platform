---
id: RW5eZ4lR8-3DTaeICCF4T
session_id: session-20260419-212102
agent_id: mcp
task: [project:ap3x-solana] Task 25: Implement RpcSubmitter for @ap3x/solana-executor
outcome: approved
created_at: "2026-04-20T04:21:25.245Z"
---

[project:ap3x-solana] Implemented RpcSubmitter in packages/solana-executor/src/submitters/rpc.ts. Key decision: RpcPool.pinForWrite() returns an RpcEndpoint descriptor (name/url/kind), NOT an object with a call() method. The actual call() method lives on the RpcPool itself. The implementation calls pinForWrite() to surface circuit_open errors early and warm selection heuristics, then calls rpcPool.call('sendTransaction', [...]) for the actual submission. The PRP's suggested test mock was adapted accordingly — mock exposes both pinForWrite() and call() on the rpcPool object. base58.encode(Uint8Array): string confirmed in @ap3x/solana-core. All 3 tests pass, tsc --noEmit clean, lint warnings only (any mocks in test file, expected). Commit: 07c4deb.