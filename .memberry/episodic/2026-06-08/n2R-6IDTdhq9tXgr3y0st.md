---
id: n2R-6IDTdhq9tXgr3y0st
session_id: session-20260607-ag3ntic-acp
agent_id: mcp
task: [project:ag3ntic] Scope decision for ACP streaming + per-tool-approval transport (handoff item b)
created_at: "2026-06-08T02:54:47.244Z"
---

[project:ag3ntic] User chose Option 2 (production transport), stated emphatically: 'I want the thing that gets us closest to production. Not a stub, not a demo, not a half-assed implementation.' (confirmed twice: prose + '2').

PREFERENCE (durable): For AG3NTIC, build production-grade, not demo/stub/half-measures. Apply to all morph work unless told otherwise. WHY: real product being readied, not a throwaway demo. HOW TO APPLY: prefer canonical §13/§17 architecture (dedicated worker owning ACP sessions, Redis pub/sub resume on tool_call_id, full PDP/gateway-unified approval with TTL+audit, real duplex docker_exec transport, validate wire contract live before depending on it) over in-process single-process shortcuts.

CONTEXT this session: ACP path far more built than handoff implied. Two parallel worlds: (A) LIVE = tasks/runs.py hermes_run_executor (one-shot `hermes chat`, gateway intercept_tool_call + _resume_run MVP shortcut that just completes the run). (B) BUILT-BUT-UNWIRED = runtime_adapter/{acp.py,hermes_adapter.py,base.py}: full ACP client + HermesRuntimeAdapter with real streaming (_pump), real pause/resume (pending_permission Future + resume_after_approval), subprocess_transport works, ONLY docker_exec_transport is a hard stub. World B uses its OWN SqlAlchemyRunStore.create_approval which BYPASSES canonical PDP (no risk eval, expires_at=now(), no audit) — must unify onto permission_gateway/service.py.

Production gaps: (1) duplex docker_exec_transport (new docker_client exec_attach; exec_output is one-shot); (2) unify World B approval onto canonical gateway (PDP/TTL/audit/state-machine); (3) map ACP toolCall->(capability_slug,action) — NO MCP capabilities attached yet (M5) so ACP request_permission fires for Hermes NATIVE tools w/ no manifest; production-correct fix = model native toolset as built-in Capability w/ manifest (mirrors §17.16 Computer Capability); (4) sync->worker: ACP session+duplex stream+pending future must outlive request across approval pause + cross-process resume (Redis pub/sub per §17); (5) ACP wire contract unvalidated live (contract-findings open item #1) — live employee container authed to openai-codex so a smoke is now possible.</content>
<tags>["project:ag3ntic", "morph", "permission-gateway", "capabilities", "computer-use", "backend", "decision", "feedback"]</tags>
<entities>["Operator", "Employee", "PermissionGateway", "ApprovalRequest", "Hermes", "Capability", "RuntimeInstance", "Cerebro"]</entities>
<outcome>approved</outcome>
