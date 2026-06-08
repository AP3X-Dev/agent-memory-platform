---
id: FJuQsTNNgUWj6z9BLzvdZ
session_id: session-20260608-ag3ntic-task5
agent_id: mcp
task: Task 5: worker-side ACP run executor with job-consumer and resume-subscriber loops
created_at: "2026-06-08T04:24:36.022Z"
---

Implemented Task 5 (worker ACP run executor) on branch morph/m1-data-model, commit df599a3.

Changes:
1. models.py: added `runtime_session_key: Mapped[str | None] = mapped_column(Text, nullable=True)` to Run class
2. alembic migration 20260608_0001: adds runs.runtime_session_key column, down_revision=20260607_0001
3. config.py: added run_worker_enabled (bool=True) and standing_grant_ttl_seconds (int=900)
4. platform_core/runtime/__init__.py + run_worker.py: execute_acp_run, run_worker_loop (pragma no cover), resume_loop (pragma no cover), _handle_resume (pragma no cover), _gateway_on_permission stub with TODO(Task 11)
5. worker.py: wires run_worker_loop + resume_loop when settings.run_worker_enabled
6. tests/test_run_worker.py: FakeAcpTransport must be constructed inside asyncio.run() on Windows (asyncio.get_event_loop() in __init__ fails outside a running loop on Python 3.12/Windows)

Key pattern: transport constructed inside async def _run() to avoid "no current event loop" error on Windows Python 3.12.