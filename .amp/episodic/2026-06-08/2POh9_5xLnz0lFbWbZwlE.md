---
id: 2POh9_5xLnz0lFbWbZwlE
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Task 11: invert Hermes adapter permission model to deny-fast; delete World-B approval plumbing; wire run_worker gateway callback; rewrite adapter permission tests
outcome: approved
created_at: "2026-06-08T06:54:40.768Z"
---

Completed Task 11 (deny-fast ACP permission handler). Commit 4530184 on morph/m1-data-model, 6 files changed +85/-275, NOT pushed.

Model change: the ACP request_permission handler no longer creates an ApprovalRequest itself or blocks on an asyncio.Future. It now (1) surfaces an approval.requested event on the run stream (run_status="running", payload tool_name/summary/tool_call_id/options — no approval_request_id), then (2) calls callback.decide(request) from gateway_bridge.make_on_permission for a FAST verdict and replies immediately. allow -> allow_once option id -> ACP {"outcome":"selected"}; deny/approval_required -> None -> ACP {"outcome":"cancelled"}. No gateway wired (decide attr absent) -> return None = fail closed. The gateway now owns the ApprovalRequest lifecycle and re-issues the run on human approval (Task 12).

Deletions (clean-repo): hermes_adapter.py — resume_after_approval method, _session_for_approval helper, SqlAlchemyRunStore.create_approval + resolve_approval, the create_approval/resolve_approval RunStore Protocol decls, _Session.pending_permission/pending_request/pending_approval_id fields, EVT_APPROVAL_RESOLVED const + __all__ entry, ApprovalResolution import, unused `from platform_core import ids` import (only approvals used it). base.py — ApprovalResolution dataclass, resume_after_approval Protocol method, __all__ entry, reworded PermissionCallback comment to deny-fast. __init__.py — ApprovalResolution import + __all__. run_worker.py — _gateway_on_permission stub now returns make_on_permission(**job); _handle_resume passes full job (run_id+workspace_id+employee_id). tests rewrote the two permission tests (allow->opt-once selected; declined->cancelled) with a _fake_on_permission helper carrying .decide.

Chased-down dangling refs: permission_gateway/service.py had TWO prose-only mentions of the deleted resume_after_approval (module docstring + resume-handler seam comment); reworded both to "re-issues the parked run / gateway fast-path" without naming the deleted method (functional decide_approval/resume-handler code untouched). Also removed now-unused PermissionRequest import from the test file (brief said keep it, but the rewrite no longer types the callback, so it was dead — clean-repo).

Tests: test_hermes_adapter.py 5 passed; run_worker+sse_live+permission_gateway 17 passed; full tests/ suite 204 passed (held at 204; replaced 2 tests with 2).