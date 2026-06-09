---
id: D9TcaqK-MSkb93OTJa6Zp
session_id: session-20260608-ag3ntic-morph
agent_id: mcp
task: [project:ag3ntic] Task 12: resume parked runs by re-issue (standing grant + redis resume signal)
outcome: approved
created_at: "2026-06-08T07:15:34.171Z"
---

[project:ag3ntic] Task 12 (final task of the ACP streaming + per-tool approval plan) done on branch morph/m1-data-model, commit 0d6061b. Changed the approval-resume model from synchronous execute-on-approve to RE-ISSUE.

Key design: decide_approval no longer executes the held action inline. On approve it calls the registered resume handler (runs._resume_run), which records a single-use StandingGrant for the held (capability, action, args_hash) linked to the approval+run and LEAVES THE RUN PARKED at waiting_approval; then publishes a Redis resume signal best-effort (try/except — the decision is already committed; works with no Redis). The worker re-issues the run; the re-attempt hits intercept_tool_call's standing-grant fast-path, which consumes the grant, sets verdict=allow/reason=standing_grant, and — if grant.approval_request_id is set — finalizes the approval approved->executed via _guard and emits approval.executed. Deny fails the parked run (unchanged).

Also: intercept_tool_call now PARKS the run (update Run running->waiting_approval) in the approval_required branch, because in the deny-fast model nobody else parks it. Added Run to the models import and a module logger.

Deleted dead code (clean-repo): _execute_approved (synchronous execute-on-approve) and _reply_runtime (deny reply). The executed/execution_failed/executed_at synchronous path is gone — execution now happens on the re-attempt.

Tests: new tests/test_resume_reissue.py (4 cases: park, approve->grant+park+publish-not-executed, re-issue->fast-path finalizes executed, deny->run failed no grant no publish). Rewrote test_permission_gateway.py: test_approve_executes_once -> test_approve_grants_and_parks (asserts approved not executed + grant exists + tc stays awaiting_approval); test_approve_invokes_resume_handler asserts approved; HTTP test_api_intercept_and_inbox_flow approve response now "approved" not "executed". DELETED test_failed_resume_marks_execution_failed (synchronous execution_failed path no longer exists). Rewrote test_tasks.py test_run_parks_on_approval_then_resumes -> _then_reissues (approve parks + grants, re-issue finalizes executed). Monkeypatch runbus.publish_resume in tests to avoid real Redis.

Full suite: 207 passed (was 204; +4 new -1 deleted). Targeted files all green.