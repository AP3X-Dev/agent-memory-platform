---
id: pzxOONbtmqaDcdh7OBv05
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Implement Redis run-bus module for AG3NTIC platform
outcome: approved
created_at: "2026-06-08T04:16:36.947Z"
---

Task 4 complete: Redis run-bus module implemented at apps/api/platform_core/runbus.py. Three channels: LPUSH/BRPOP list ag3ntic:run_jobs for job queue, pubsub run:{run_id}:events for event fan-out, pubsub run:{run_id}:resume for approval resume signals. All functions use redis.asyncio.from_url(settings.redis_url, decode_responses=True) matching project convention. Live pubsub functions (subscribe_events, subscribe_resume) are marked pragma: no cover. Tests monkeypatch _redis coroutine. 3 tests pass. Commit 222eeed on morph/m1-data-model.