---
id: qjTXKLdDt7ms9dFh8yGwo
session_id: session-20260422-120000
agent_id: mcp
task: [project:agent-assist-cr] Apply four follow-up fixes to pipeline_applicator multi-job slice 2 tests
outcome: approved
created_at: "2026-04-23T17:52:58.959Z"
---

[project:agent-assist-cr] Applied four code-review follow-ups on the root-mirror shim in pipeline_applicator (slice 2). Real AssistStateStore replaces MagicMock in multi-job tests, using set_for_test + store.get(sid) pattern consistent with existing test_pipeline_applicator.py fixtures. REPLACE-case test added using ProbingQuestionsLoader.replace_classification_for_test (same pattern as test_fr22_step_order). Pre-sync loop annotated with root cause (create_empty builds root and active_job as distinct objects). Redundant trailing _sync_root_mirrors_from_active_job call dropped since the tail resync loop makes it a no-op. Loop variable _name renamed to name for consistency. All 1677 tests pass. Committed as 9c6448e on feature/multi-job-tickets.