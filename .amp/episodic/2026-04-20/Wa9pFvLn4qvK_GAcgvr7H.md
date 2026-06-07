---
id: Wa9pFvLn4qvK_GAcgvr7H
session_id: session-20260419-193134
agent_id: mcp
task: [project:ap3x-solana] Task 3 PRP-02: cold-start tx-history fixture capture script
outcome: approved
created_at: "2026-04-20T02:32:11.646Z"
---

[project:ap3x-solana] Implemented Task 3 of PRP-02: capture:cold-start-tx-history script. Key decisions: (1) spl-accounts.json.gz fixture is a JSON object not JSONL — parsed with zlib.gunzip + JSON.parse, reading decoded.owner/mint/amount/state fields directly without re-decoding raw bytes. (2) Used node --import tsx invocation pattern (matching existing capture:spl and capture:metaplex scripts), not bare tsx. (3) Smoke test uses existsSync guard at module level to conditionally assign it.skip — 1 test skipped, 0 failed when fixture absent. (4) Script correctly fails at RPC layer (not syntax) when RPC_URL=invalid. Output files: tests/helpers/capture/capture-cold-start-tx-history.ts, tests/helpers/capture/capture-cold-start-tx-history.test.ts. Commit: 654e7a1.