---
id: YxwIYFPpds_p_AgYgtwRJ
session_id: session-20260419-213200
agent_id: mcp
task: [project:ap3x-solana] Task 28: JitoGrpcSubmitter + in-process gRPC fake server for @ap3x/solana-executor
outcome: approved
created_at: "2026-04-20T04:33:30.862Z"
---

[project:ap3x-solana] Task 28 complete. Implemented JitoGrpcSubmitter using vendored Jito proto via loadSearcherProto(). Key finding: SendBundleRequest wraps bundle.Bundle { packets: packet.Packet[] } — NOT a top-level transactions array as the task spec suggested. Corrected the proto structure to { bundle: { packets: payload.signedTxs.map(tx => ({ data: tx })) } }. The gRPC client stub exposes sendBundle (camelCase) from the proto's SendBundle RPC. Added in-process gRPC fake server in tests/helpers/jito-fake-server.ts using grpc.Server.bindAsync on port 0. Added tsconfig.test.json (rootDir: '.', includes src/**/* + tests/**/*) and updated typecheck script to use it, since test file in src/ imports from ../../tests/helpers/. All 5 new tests + 8 pre-existing tests pass. Commit: cdf762b.