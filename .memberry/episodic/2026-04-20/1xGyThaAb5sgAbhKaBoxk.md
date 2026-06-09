---
id: 1xGyThaAb5sgAbhKaBoxk
session_id: session-20260419-003500
agent_id: mcp
task: [project:ap3x-solana] T45: examples/spl-watcher scaffold + SPL transfer signal fixture
outcome: approved
created_at: "2026-04-20T07:35:52.067Z"
---

[project:ap3x-solana] T45 complete. Scaffolded examples/spl-watcher mirroring examples/solana-watch. Key decisions: (1) SPL_TOKEN_PROGRAM_ID was already exported from @ap3x/solana-spl/src/index.ts lines 57-60 — no modification needed. (2) Stub src/index.ts with single comment line for T46/T47. (3) Fixture generator uses sha256 from @noble/hashes/sha256 to produce deterministic 64-byte fake signatures (double sha256 for realistic length), encodes via base58 from @ap3x/solana-core. (4) 50 signals total, signals 0-9 target WATCHED_WALLET=11111111111111111111111111111112, signals 10-49 target 5 rotating other wallets. (5) amounts stored as plain JSON numbers (fit in MAX_SAFE_INTEGER). (6) raw.programId stored as base58 string — FixtureSignalSource.parseSignal reads it back as string (does not convert raw.programId to PublicKey contrary to what the task spec implied). (7) Determinism verified: byte-identical output across two runs. Commit: a9f2999.