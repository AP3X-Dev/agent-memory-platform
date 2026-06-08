---
id: d0waOXWlOo2CSsXM_UAcd
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: [project:ag3ntic] Phase 3 progress (Tasks 8-10 done) + discovered run_event sequencer collision blocking Tasks 11-12
created_at: "2026-06-08T06:21:19.562Z"
---

ACP plan Phase 3 progress on branch morph/m1-data-model (all reviewed spec+quality, suite green 204):
- Task 8 (StandingGrant model + tool_calls.args_hash + Alembic 20260608_0002): commits 7e0ebe1, e57cf2c. NOTE runs.runtime_session_key already existed (migration 20260608_0001) — not re-added.
- Task 9 (permission_gateway/standing_grants.py: args_hash/create/find/consume): d14ea25, dcbaa7d.
- Task 10 (intercept_tool_call grant fast-path + args_hash persist): 4e1df3e, 7779220. DESIGN DECISIONS: grant check placed AFTER evaluate(), gated on verdict=="approval_required" (cleaner + safer: a stale grant can NEVER override an explicit deny). Approval-finalize-on-consume DEFERRED to Task 12. Added adversarial test locking the deny-override invariant.

DISCOVERED BLOCKER for Tasks 11-12 (run_event sequence collision): the M4 adapter persists run_events via SqlAlchemyRunStore.append_event using an IN-MEMORY session.sequence counter (1,2,3..), while the gateway writes run_events via runlog.append_run_event using DB max(sequence)+1 (and bumps run.last_sequence). Task 11's deny-fast bridge calls gateway.intercept_tool_call SYNCHRONOUSLY inside the ACP permission handler, mid-stream — so for one run BOTH writers emit run_events with independent counters → collision on uq_run_event_seq (prod IntegrityError; SQLite test wouldn't catch it since the unique constraint is migration-only, not in __table_args__). RESOLUTION (spec-backed): design spec §7.5 line 340 says "the pump persists each event via runlog.append_run_event (sequenced = SSE id:)" — i.e. ONE canonical sequencer. Fix = route the adapter's _enqueue/SqlAlchemyRunStore.append_event through append_run_event (which returns the assigned RunEvent.sequence so the worker publishes the same number it persists). This expands Task 11 scope beyond the plan text.

Task 11 also: create runtime_adapter/tool_mapping.py (Task 14 pulled forward — bridge needs it) + gateway_bridge.py (decide/make_on_permission); rework _make_permission_handler to deny-fast (no hours-long future block); DELETE World-B: SqlAlchemyRunStore.create_approval/resolve_approval, adapter.resume_after_approval (+ base.py Protocol method), _session_for_approval, pending_* plumbing — these have NO live external caller (gateway _RESUME_HANDLER is tasks/runs.py::_resume_run, which never calls adapter.resume_after_approval). Wire run_worker._gateway_on_permission (currently TODO(Task 11) stub).