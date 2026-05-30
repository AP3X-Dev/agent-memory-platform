---
id: ov6djZDOI0BI_0RfP9FHI
session_id: session-20260419-120000
agent_id: mcp
task: [project:ap3x-solana] Task 27: vendor jito-labs/mev-protos proto files + loader helper + CI gate for @ap3x/solana-executor
outcome: approved
created_at: "2026-04-20T04:29:30.424Z"
---

[project:ap3x-solana] Task 27 completed. Vendored four proto files from jito-labs/mev-protos@46ead86a13a55a0ef2c139db96a8ee93bf7505e3 (Apache-2.0): searcher.proto, bundle.proto, packet.proto, shared.proto. The full transitive closure is needed because bundle.proto imports packet.proto and shared.proto. Implemented src/proto/load.ts with loadSearcherProto() using @grpc/proto-loader loadSync with includeDirs pointing to the proto directory. Added src/proto/load.ts as a second tsup entry so it compiles to dist/proto/load.js (ESM). The onSuccess() hook copies all .proto files to dist/proto/. CI gate placed after Build step. Proto-load smoke test passed locally (SearcherService is a function). CJS build emits a warning about import.meta being empty, which is benign — the CI gate uses ESM import(). Header format mirrors yellowstone.proto pattern exactly.