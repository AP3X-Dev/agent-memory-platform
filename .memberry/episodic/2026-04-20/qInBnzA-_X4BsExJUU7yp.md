---
id: qInBnzA-_X4BsExJUU7yp
session_id: session-20260419-225900
agent_id: mcp
task: [project:ap3x-solana] T39: intentId derivation in @ap3x/solana-strategy
outcome: approved
created_at: "2026-04-20T05:59:21.663Z"
---

[project:ap3x-solana] Implemented intentId(input: IntentIdInput): string in packages/solana-strategy/src/intent-id.ts. Uses sha256 from @noble/hashes and base58 from @ap3x/solana-core, NUL-byte separator between fields (signalId, strategyName, instanceId, decisionVersion). decisionVersion defaults to 'v1'. Mirrors signal-id pattern from solana-signals. 8 tests written first (TDD), all pass. Exported from src/index.ts as intentId + IntentIdInput. Commit 0c3f6af on prp-02-solana-runtime.