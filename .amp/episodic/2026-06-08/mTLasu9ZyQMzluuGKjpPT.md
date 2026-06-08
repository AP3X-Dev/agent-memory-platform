---
id: mTLasu9ZyQMzluuGKjpPT
session_id: session-20260607-ag3ntic-review
agent_id: mcp
task: Code review Task 7: _acp_eligible + start_run routing in runs.py
outcome: approved
created_at: "2026-06-08T04:54:49.719Z"
---

Task 7 change reviewed and APPROVED. _acp_eligible query exactly mirrors hermes_run_executor (same 4 WHERE filters + ORDER BY created_at desc + container_name check). start_run branch correct: enqueue path returns immediately (no inline executor); else falls through to _get_executor() unchanged. run_worker_enabled defaults True in config.py:67. runbus import is lazy (inside branch). All executor functions (_default_executor, hermes_run_executor, _resume_run, etc.) untouched. 192 tests pass (was 177, added 15). One cosmetic dead-code issue: _seed_with_runtime's `if healthy or not healthy` guard is always True; healthy=False/has_container=False branches never called. Redis-in-tests risk is documented: monkeypatch covers it correctly. No blocking issues.