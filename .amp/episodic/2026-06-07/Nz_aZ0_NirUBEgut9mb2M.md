---
id: Nz_aZ0_NirUBEgut9mb2M
session_id: session-20260607-hermes-m4
agent_id: mcp
task: [project:ag3ntic-platform] M4: Build Hermes employee runtime adapter over ACP JSON-RPC stdio
created_at: "2026-06-07T16:27:26.911Z"
---

[project:ag3ntic-platform] Building platform_core/runtime_adapter package (M4). Hermes 0.14.0 has NO /v1/runs — it is a CLI agent driven via ACP (Agent Client Protocol), JSON-RPC over stdio (stdout=protocol, stderr=logs). Key design facts gathered: errors.HermesError maps to 502 taxonomy category. RunEvent.event_type comment names: chat.run_started, tool.started, approval.requested. runs.status §5.4 enum: queued|running|waiting_approval|cancelling|cancelled|succeeded|failed. ACP permission options allow_once|allow_session|allow_always|deny map directly to ApprovalRequest/ApprovalDecision. Adapter method to ACP method mapping: start_run -> initialize+session/new+session/prompt; chat -> session/prompt; stream_run_events -> consume session/update; resume_after_approval -> reply to held request_permission; session/cancel for cancel. Tests use a FakeAcpTransport (in-memory reader/writer pair) per the conftest SQLite pattern. ids prefixes: RUN_EVENT='rune', APPROVAL_REQUEST='apr', APPROVAL_DECISION='apd'. Docker client functions are module-level for monkeypatch. Lean Dockerfile FROM python:3.11-slim, entrypoint hermes-acp, NO desktop layers.