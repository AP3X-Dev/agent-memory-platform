---
id: qoYLurHR7RqSOolW7nglo
session_id: session-20260416-120000
agent_id: mcp
task: [project:agent-assist-cr] Task 14: Must-book forces regular hours + composes must_book_reason
outcome: approved
created_at: "2026-04-16T21:01:06.405Z"
---

[project:agent-assist-cr] Task 14 completed. Two behaviors implemented in call_context_resolver.py: (1) _populate_scheduling now accepts include_regular=True keyword arg, applied only in the time-period fallback branch (not precision mode), to union in regular-hours rows when mustBook is active. (2) _populate_must_book now tracks chosen_condition and composes must_book_reason as "Qualifies for Must Book: {trade} — {conditions}". Renderer delivery accommodation prepends must_book_reason to must_book_rule since sop-panel.js only reads must_book_rule. SOPAlertMetadata has trade: str | None (singular), not trades: list — test plan stub adapted to use real SOPAlertMetadata. The existing test_scheduling_alert_activates_must_book_scheduling_fees_jobtype was updated to assert contains rather than exact equality on must_book_rule. One integration test (test_clear_poll_resets_call_sop_state) was flaky — passed on re-run. 29 resolver tests pass, 1041 total pass, mypy --strict clean, ruff clean. Commit: 2ff8322.