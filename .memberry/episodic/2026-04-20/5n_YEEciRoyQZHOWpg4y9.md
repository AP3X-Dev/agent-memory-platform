---
id: 5n_YEEciRoyQZHOWpg4y9
session_id: session-20260419-191800
agent_id: mcp
task: [project:ap3x-solana] PRP-02 Task 2: SPL Token transfer decoders added to @ap3x/solana-spl
outcome: approved
created_at: "2026-04-20T02:19:27.531Z"
---

[project:ap3x-solana] Completed Task 2 of PRP-02. Added two new decoder files under packages/solana-spl/src/decoders/. Key decisions and adjustments vs. plan:

1. decodeBase64Data is in @ap3x/solana-events (parse-logs.ts), NOT @ap3x/solana-core. Since solana-spl cannot import solana-events (boundary rule: spl → core, tx only), transfer-log.ts inlines a local base64ToBytes helper using atob() — same pattern as holder-queries.ts.

2. The canonical program IDs TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID already exist in program-ids.ts. The new files define SPL_TOKEN_PROGRAM_ID and SPL_TOKEN_2022_PROGRAM_ID as separate aliases for use by decoder-path consumers. No collision in index.ts exports.

3. ProgramLogChunk in @ap3x/solana-events uses programId: string (base58), but the new local interface uses programId: PublicKey — intentionally structurally different to match decoder-chain usage where keys are already resolved. Plan guidance explicitly anticipated this.

4. All 7 new tests pass (4 for decodeTransferInstruction, 3 for parseTransferLog). Full suite: 102 tests passing (95 baseline + 7 new). Build and lint clean (0 errors). Commit: 47e57f3.