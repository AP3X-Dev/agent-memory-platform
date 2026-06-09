---
id: MV1fSh9WdnHgA0csnFiEm
session_id: session-20260422-000000
agent_id: mcp
task: [project:agent-assist-cr] Slice 2 Task 1: per-Job state in ExtractionPipeline
outcome: approved
created_at: "2026-04-23T17:33:09.562Z"
---

[project:agent-assist-cr] Refactored ExtractionPipeline to use _JobPipelineState keyed by Job.id. Key decision: existing tests called _sid_state() freshly on each tick, generating a new UUID Job.id per call — this broke streak accumulation. Fix was to reuse the same AssistState instance across ticks in 4 tests (test_lock_streak_caches_after_three, test_canonical_change_breaks_lock, test_cosmetic_change_keeps_lock, test_pipeline_passes_turn_ids_on_lock_break_path). _last_equipment_type stays per-session on the pipeline instance, not in _JobPipelineState. snapshot() uses first available job state for single-job compat (no job_id arg needed for existing callers). Helpers that gained job_id param: _check_and_break_lock, _update_lock_state, _update_shown_ids, _run_stage3_and_filter. Commit 27984c0 on feature/multi-job-tickets.