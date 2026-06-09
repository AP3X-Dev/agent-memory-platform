---
id: ZfvUTpjwhx7nCTBOKIaQs
session_id: smart-drain-task5-2026-04-07
agent_id: mcp
task: [project:agent-assist-cr] Task 5: Refactor stop_session() to use DrainCoordinator
outcome: approved
created_at: "2026-04-07T23:55:09.047Z"
---

[project:agent-assist-cr] Refactored stop_session() in session_manager.py to use DrainCoordinator for non-blocking graceful shutdown. Key changes: (1) Added DrainCoordinator import, (2) stop_session now sets status to DRAINING instead of PROCESSING, no longer calls stream_client.stop() directly — passes stream_client to DrainCoordinator which calls drain() on it, (3) stop_session returns immediately after coordinator.run_async(), (4) Added _drain_cleanup method as on_complete callback — handles test scenario transcript dumps, comparison logger cleanup, executor/futures cleanup, and stopping flag discard, (5) Added _run_final_analysis_for_drain method that bypasses _is_session_done guard for the deliberate final sweep, (6) Updated _streaming_sop_feed and _streaming_sop_feed_safe with is_final parameter to bypass _is_session_done guard during drain's final SOP call. All 396 tests pass.