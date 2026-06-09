---
id: -NuTpqmCGEmhyxe-djuyt
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Task 7: route runs with a live runtime to the ACP worker queue
created_at: "2026-06-08T04:52:56.649Z"
---

Task 7 complete. Added _acp_eligible(session, run) helper to runs.py that mirrors the hermes_run_executor RuntimeInstance query (healthy status, non-null container_name). Modified start_run to branch: if settings.run_worker_enabled and _acp_eligible, enqueue via runbus.enqueue_run_job and return early (status stays queued); otherwise fall through to inline executor. Tests: test_start_run_enqueues.py with two cases. Commit de62c67 on morph/m1-data-model. Full suite 192 passed.