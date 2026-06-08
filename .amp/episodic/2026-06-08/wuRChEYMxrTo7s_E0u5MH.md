---
id: wuRChEYMxrTo7s_E0u5MH
session_id: session-20260607-ag3ntic-acp
agent_id: mcp
task: [project:ag3ntic] Approved spec + implementation plan for ACP streaming + per-tool approval (handoff item b)
created_at: "2026-06-08T03:27:56.958Z"
---

[project:ag3ntic] Brainstorming→spec→plan complete for the ACP streaming + per-tool-approval transport. User approved production scope (Option 2) and the design.

ARTIFACTS (both gitignored under platform/docs/ per project convention — internal planning):
- Spec: platform/docs/superpowers/specs/2026-06-08-acp-streaming-per-tool-approval-design.md
- Plan: platform/docs/superpowers/plans/2026-06-08-acp-streaming-per-tool-approval.md (18 tasks, 5 phases, TDD, runnable code grounded in real harness)

PLAN SHAPE (5 phases): P1 duplex docker transport (docker_client.exec_attach + DockerStreamDemuxer + docker_acp_transport.py bridge; replace docker_exec_transport stub). P2 worker-owned execution: runbus.py (Redis job queue + event fan-out + resume signals), run_worker.py (execute_acp_run + run_worker_loop + resume_loop), SSE live tail on GET /runs/{id}/events, start_run enqueues. P3 gateway unify + re-issue: StandingGrant model+table, standing_grants.py, grant-aware intercept_tool_call, gateway_bridge.py (deny-fast: allow->allow_once, deny/approval_required->cancelled+park), _resume_run rewrite (create grant + publish resume, NOT complete), decide_approval publishes resume post-commit. P4 native gating: built-in shell CapabilityManifest (run_command, high, approval_required) + seed + tool_mapping.py + live Cerebro acceptance smoke. P5 demote one-shot hermes chat to fallback (keep, don't delete) + docs + cleanliness.

KEY GROUNDED FACTS used in the plan: conversations.runtime_session_key already exists (models.py:488); add runs.runtime_session_key + ensure tool_calls.args_hash. Tests use tests/conftest.py SQLite + per-file _make_engine_and_factory + FakeAcpTransport (test_hermes_adapter.py) — reuse that peer. settings.redis_url exists (redis.asyncio). ag3ntic-worker.py is currently sweep-only (expire_approvals); we add run loops. SSE endpoint GET /runs/{id}/events exists as replay-only; extend to live tail.

TOP BUILD RISKS to validate during impl: (1) does docker-socket-proxy proxy the hijacked exec stream (blocks P1); (2) does the model re-attempt after explicit re-authorization on a session/load-ed session (determines re-issue Mitigation A vs B); (3) session/load context fidelity.

NEXT: user picking execution mode (subagent-driven recommended vs inline). Implementation not yet started; branch morph/m1-data-model, branch-only.</content>
<tags>["project:ag3ntic", "morph", "permission-gateway", "capabilities", "Hermes", "backend", "project"]</tags>
<entities>["Hermes", "PermissionGateway", "ApprovalRequest", "Employee", "RuntimeInstance", "Capability", "platform"]</entities>
<outcome>approved</outcome>
