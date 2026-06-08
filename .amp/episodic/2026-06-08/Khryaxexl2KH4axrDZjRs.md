---
id: Khryaxexl2KH4axrDZjRs
session_id: session-20260607-ag3ntic-acp
agent_id: mcp
task: [project:ag3ntic] ACP build progress: Phases 1-2 complete (transport + worker streaming pipeline)
created_at: "2026-06-08T04:56:15.822Z"
---

[project:ag3ntic] Implementing the ACP streaming + per-tool-approval plan (docs/superpowers/plans/2026-06-08-acp-streaming-per-tool-approval.md) via subagent-driven development on branch morph/m1-data-model (branch-only, not pushed). Each task: implementer + spec review + code-quality review + fixes. Local pytest works (Python 3.12; scope to tests/, NOT whole repo — packages/mcp-server has pre-existing collection errors).

DONE — Phase 1 (transport): T1 docker_client.exec_attach + DockerStreamDemuxer (fc0ec32, f50d815). T2 docker_acp_transport.py async (reader,writer) bridge over the exec socket, hardened teardown + EOF/overflow tests (f9f1967, 12e8ac3). T3 wired docker_exec_transport replacing the stub (f15c983).

DONE — Phase 2 (worker + streaming): T4 runbus.py Redis job-queue/event-fanout/resume-signals (222eeed). T5 runtime/run_worker.py execute_acp_run + run_worker_loop + resume_loop; added runs.runtime_session_key column + alembic migration 20260608_0001 (down_revision 20260607_0001); config run_worker_enabled + standing_grant_ttl_seconds; hardened: done-callbacks on ensure_future, duplicate-run guard, fail orphaned runs (df599a3, b8be201). T6 SSE live tail on GET /runs/{id}/events: backfill + Redis subscribe_events + dedupe + terminal break, no DB session in the generator (b32c1b1). T7 start_run routes ACP-eligible runs (healthy RuntimeInstance w/ container_name) to runbus.enqueue_run_job, inline executor kept as fallback (de62c67).

STATE: full api suite 192 passed; cleanliness gate PASS. The streaming pipeline works end-to-end in unit tests with a FakeAcpTransport. Currently the worker's on_permission is a None stub (_gateway_on_permission TODO Task 11) — so a request_permission would get a deny reply; the real gateway/park/re-issue is Phase 3.

REMAINING: Phase 3 (T8-12) gateway unification: StandingGrant model+table+migration, standing_grants.py, grant-aware intercept_tool_call + persist tool_calls.args_hash, gateway_bridge.py (deny-fast), rework adapter permission handler off World-B RunStore, rewrite _resume_run to create-grant+publish-resume (NOT complete), decide_approval publishes resume post-commit, finalize approval.executed on the re-attempt. NOTE: T8 should now DROP runs.runtime_session_key (already added in T5) and only add standing_grants + tool_calls.args_hash. Phase 4 (T13-16) shell capability + tool_mapping + seed + LIVE Cerebro acceptance smoke (validates re-issue risk #2). Phase 5 (T17-18) demote one-shot to fallback + docs + cleanliness + handoff. Top build risk still open: does docker-socket-proxy proxy the hijacked exec stream (validate during Phase 4 deploy).</content>
<tags>["project:ag3ntic", "morph", "permission-gateway", "Hermes", "backend", "project"]</tags>
<entities>["Hermes", "PermissionGateway", "Employee", "RuntimeInstance", "ApprovalRequest", "platform"]</entities>
<outcome>approved</outcome>
