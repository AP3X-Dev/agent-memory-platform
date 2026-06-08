---
id: 3w0M0WZt5sM7YkEpT1ryk
session_id: session-20260416-120000
agent_id: mcp
task: [project:agent-assist-cr] Task 2 — Add ExtractionPipeline.run_final_sweep
outcome: approved
created_at: "2026-04-17T09:18:51.800Z"
---

[project:agent-assist-cr] Added run_final_sweep as a separate public method on ExtractionPipeline (src/engine/agents/extraction_pipeline.py). Method acquires _run_lock, sets per-speaker stream attributes, then delegates to _run_once with allow_post_stop=True. Returns PipelineResult (non-optional) with an assert guard. Does not check _analysis_in_flight — drain is a single explicit call, not a coalesced tick. Test added: test_run_final_sweep_returns_result_on_stopped_session confirms non-None return on a stopped session and that run() still returns None for the same pipeline. Commit 750260a on feat/correctness-pipeline. Suite: 1166 passed, mypy --strict clean, ruff clean.