---
id: TOKg4fv4SMUMwLRwwHxER
session_id: session-20260607-ag3ntic-task6
agent_id: mcp
task: Task 6: extend run-events SSE endpoint from one-shot replay to live Redis tail with Last-Event-ID backfill and deduplication
outcome: approved
created_at: "2026-06-08T04:43:16.769Z"
---

Implemented Task 6. Router: added _sse_frame() helper and _TERMINAL_EVENTS set at module level. Replaced the one-shot SSE branch in run_events() with an async generator _sse_live() that: (1) backfills serialized (already fetched before StreamingResponse) by iterating serialized, (2) calls runbus.subscribe_events(run_id) for the live tail, dedupes by sequence, breaks on terminal event. JSON branch unchanged. No DB session used inside the generator. Tests: test_runs_sse_live.py with 3 tests covering main backfill+live path, dedupe overlap, and JSON branch unchanged. All 190 tests pass. Commit b32c1b1 on morph/m1-data-model.