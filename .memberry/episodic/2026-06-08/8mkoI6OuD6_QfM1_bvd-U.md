---
id: 8mkoI6OuD6_QfM1_bvd-U
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: [project:ag3ntic] HANDOFF → Phase 4 (Tasks 13-16): seed shell capability + live Cerebro acceptance smoke. Start here next session.
outcome: approved
created_at: "2026-06-08T08:14:06.560Z"
---

NEXT-SESSION BRIEF (Phase 4 of docs/superpowers/plans/2026-06-08-acp-streaming-per-tool-approval.md). Phases 1-3 COMPLETE; branch morph/m1-data-model @ HEAD 1972ed2, pytest tests/=209 PASS, cleanliness_gate.sh=PASS, all committed NOT pushed. The full re-issue per-tool-approval model is built+unit-tested (see project_state core block for how it works) but the LIVE ACP path has NEVER been smoke-tested on Cerebro.

AUTONOMOUS (code+tests, no server) — do these first:
- Task 13: built-in `shell` CapabilityManifest + apps/api/platform_core/capabilities/seed_shell.py. seed_shell_capability(session, *, workspace_id)->capability_id (idempotent); attach_shell_to_employee(session, *, workspace_id, employee_id) = EmployeeCapability binding status "attached" + a permission_policy entry {shell:{run_command:{decision:"approval_required"}}}.
  ⚠️ GOTCHA: the plan's Task-13 sketch uses `permissions.actions.run_command` — that schema is WRONG. The REAL manifest schema is FLAT: `permissions: {run_command: {risk:"high", default:"approval_required"}}` + `tool_filter: {include:["run_command"]}`. A proven, validated shell manifest already exists at tests/test_acp_gateway_interleave.py::_shell_manifest (type "mcp_stdio", scope "system") — crib from it. Read capabilities/service.py::effective_tool_actions to confirm the read shape.
- Task 14: ALREADY DONE — runtime_adapter/tool_mapping.py maps every ACP terminal request_permission → ("shell","run_command",{command,description}).
- Task 15: a seed/provision script (e.g. platform_core/scripts/seed_shell_demo.py) calling seed_shell_capability + attach_shell_to_employee for the demo workspace/employee so the PDP resolves (shell,run_command)=approval_required. Document the docker exec invocation in docs/deployment-quickstart.md.

NEEDS THE USER (guerrillamedia702@gmail.com) — Task 16 live acceptance smoke on Cerebro (use the `cerebro` skill, 192.168.0.25):
  1. AUTHORIZATION to deploy/restart the isolated `ag3ntic` compose project at ~/projects/ag3ntic-morph (separate from Nimbus; host ports web 8095/api 8096). Outward-facing infra action — get explicit OK before redeploying.
  2. Interactive auth IF cerebro SSH/access isn't already valid (user runs a `! <cmd>`).
  3. A STOP-and-decide if the live Hermes ACP wire contract (request_permission / session/load shape) contradicts what we built against (Hermes=assumption-to-validate rule). Record real wire deltas in docs/hermes-contract-findings.md + MemBerry.
  The smoke itself can be driven by the agent (deploy → start a run whose employee attempts a dangerous shell cmd → confirm SSE: tool.started then approval.requested, run=waiting_approval, Approval Inbox card → approve via the decide_approval API AFTER >60s → confirm re-issue: command executes, approval.executed + run.completed, run=succeeded). Validate spec §6.3 risk #2 (the model RE-ATTEMPTS the action after re-authorization on session/load re-prompt); if it doesn't reliably, switch run_worker._handle_resume to Mitigation B (fresh session + original task pre-noting the approval) and re-test.

THEN Phase 5 (17-18): demote one-shot hermes_run_executor (hermes chat) to a documented fallback registered only when ACP unavailable (do NOT delete — confirm-before-remove rule; it's the proven golden-path executor); update docs/security.md (gateway mediates native shell via ACP, 60s ceiling + re-issue) + docs/deployment-quickstart.md (worker run loop, seed step, SSE). Run cleanliness gate. Final MemBerry summary + handoff.

GOTCHAS: always `python -m pytest tests/` (bare pytest fails collection on untracked packages/mcp-server/). Bash cwd persists across calls — a failed `cd` strands it; prefer absolute paths or re-cd to platform root. SqlAlchemyRunStore=adapter persistence port; gateway_bridge.make_on_permission wires the deny-fast callback (worker passes full run_id+workspace_id+employee_id). Re-provision operator: docker exec ag3ntic-api-1 python -m platform_core.provision_operator ...