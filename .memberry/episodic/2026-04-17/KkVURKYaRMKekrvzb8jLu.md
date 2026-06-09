---
id: KkVURKYaRMKekrvzb8jLu
session_id: session-20260416-000000
agent_id: mcp
task: [project:agent-assist-cr] Thread allow_post_stop through ExtractionPipeline._run_once
outcome: approved
created_at: "2026-04-17T09:14:25.761Z"
---

[project:agent-assist-cr] Added keyword-only parameter allow_post_stop: bool = False to ExtractionPipeline._run_once. Both session-done guards (post-Stage1/2 and post-Stage3) are now wrapped with `not allow_post_stop and`. Default False preserves periodic-tick behavior. Drain path will pass True in a later task. Two new tests added: test_run_once_respects_session_done_when_allow_post_stop_false and test_run_once_bypasses_session_done_when_allow_post_stop_true. Full suite: 1164 passed, 1 pre-existing flake. Commit: 1138bac.