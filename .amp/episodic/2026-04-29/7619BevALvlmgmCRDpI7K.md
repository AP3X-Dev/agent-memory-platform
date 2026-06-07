---
id: 7619BevALvlmgmCRDpI7K
session_id: session-20260429-backfill
agent_id: mcp
task: [project:agent-assist-cr] Submission pipeline — SubmissionService.submit_all per-Job fan-out
outcome: approved
created_at: "2026-04-29T12:12:06.331Z"
---

[project:agent-assist-cr] Built the submission pipeline end-to-end on 2026-04-24. Models layer first: Job.submission_status + error + submitted_at fields (d0c4acc), and new SessionMeta + SubmitResult + SubmitResponse envelope models (ff904e3). Builder build_call_submission constructs the per-Job envelope from a Job snapshot (d005a6a). SubmissionService.submit_all performs fan-out across all Jobs in the session (a473504) with _submit_one catching broad Exception deliberately so one failed Job cannot poison the batch (7e15239).

Timestamp invariant: all envelope timestamps emit Z-suffix UTC; naive datetimes are rejected at the builder boundary (aae1484). This guards against timezone drift on Electron's clock vs. the portal's server clock.

Route surface: POST /sessions/{sid}/submit performs per-Job fan-out via SubmissionService (3b46036); the dead `except PortalServerError` clause was removed since Submission's broad-exception strategy handles it (2cce465). DrainCoordinator's Phase 3 form-review step now iterates state.jobs so multi-Job sessions complete drain correctly (7a2bb48). Wired PortalClient into engine.portal_client as the singleton transport (ceb72d9).

Test contract: tests/test_submission_builder.py pins the envelope output against the mock-portal contract (1fd2c3c) — ensures the builder's structural output cannot drift away from what the mock portal expects.

Result: a single /submit call now produces N portal submissions for N Jobs, each independently success-or-fail with status reflected on the Job, surfaced in the response.