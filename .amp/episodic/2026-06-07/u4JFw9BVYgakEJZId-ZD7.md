---
id: u4JFw9BVYgakEJZId-ZD7
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Phase C accept-proposal + adversarial review fixes; session-end checkpoint for M11/M12/Phase C
outcome: approved
created_at: "2026-06-07T22:11:13.028Z"
---

SESSION COMPLETE. Branch morph/m1-data-model, HEAD 520ef7b, NOT pushed. 4 commits this session: 7a36a0e(M11) 2876f77(M12) 13423ce(Phase C) 520ef7b(review fixes). Evidence: pytest 174 passed; cleanliness gate PASS at M12 (ps1+sh); apps/web build green (13 routes); rg '/api/(vnc|terminal)' infra/ = 0.

PHASE C (13423ce): POST /api/v1/workspaces/{ws}/operator/proposals/{id}/accept -> service.accept_proposal mints Employee(status=draft)+EmployeeRevision(rev 1) from the proposal's validated spec via the canonical runtime_orchestrator.service.create_employee_from_spec (REUSED, not duplicated), sets current_revision_id, transitions proposal ready->accepted (target_employee_id + accepted_revision_id). Console "Accept proposal" action on operator page links to the new employee. OperatorProposal created with status="ready" (NOT "proposed" despite model comment). ApprovalDecisionIn.verdict is Literal["approve","deny","request_changes"].

ADVERSARIAL REVIEW (4-dim workflow, 25 findings/12 confirmed/13 correctly dismissed) -> all 12 fixed in 520ef7b:
- CRITICAL gap found+fixed: the composite uniques uq_employee_slug (partial WHERE deleted_at IS NULL), uq_employee_operator (partial WHERE kind='operator' AND deleted_at IS NULL), uq_revision_number existed ONLY as models.py comments ("in migration") but were in NEITHER the migration NOR __table_args__. The test DB is built by Base.metadata.create_all (from models), NOT alembic (init_db stamps when tables already exist), so migration-only constraints are NOT enforced/tested. FIX: added them to BOTH models.py __table_args__ (Employee, EmployeeRevision) AND the baseline migration 20260607_0001. accept_proposal now maps IntegrityError->409 across the whole mint (the conflicting INSERT raises at FLUSH inside create_employee_from_spec, so the try wraps mint+commit, not just commit).
- accept privilege guard: reject spec kind!='employee' (422) — else a proposal could mint a 2nd reserved Operator.
- backup smoke (scripts/smoke_backup_restore.py): MinIO `mc pipe` needed `docker run -i` (without it -> zero-byte object + false PASS); added -i + `mc cat` content verify + disposable `{bucket}-src-smoke` source bucket (no real-bucket leak). Qdrant: recover-by-file-path tested qdrant's INTERNAL snapshot not the saved artifact -> switched to upload-based restore (POST .../snapshots/upload?priority=snapshot -F snapshot=@/backup/...) into a `_restore` collection.
- apps/web/.dockerignore + apps/api/.dockerignore (the build context is apps/web|apps/api, so the repo-root .dockerignore is a no-op; COPY . . was overwriting Linux node_modules with host Windows ones).
- deploy: dedicated --build-timeout 1800.
- audit tamper test re-reads from a fresh session (identity-map + expire_on_commit=False was masking DB persistence).

KEY LEARNINGS for future sessions: (1) Tests build schema via create_all from MODELS, not alembic — so any DB constraint MUST be in models __table_args__ to be enforced in tests, not just the migration. (2) The fork has a migration<->model divergence: many constraints documented as "in migration" comments may not be in __table_args__ (so untested). (3) Build contexts apps/web + apps/api each need their own .dockerignore.

DEFERRED (docs/MORPH-BLOCKERS.md "M11/M12" + "review-driven follow-ups"): Phase D live Cerebro smokes (human-supervised — outward-facing, could disrupt live /ag3ntic); registry-aware manifest validator (doesn't exist; gateway provides default-deny defense-in-depth but only floors high/critical allow-overrides); OperatorJob 'succeeded' vs documented 'completed'; immutable-image deploy split; runtime secret rotation stub; provision_operator not renamed to provision_admin; console basePath for /ag3ntic sub-path; stale docs/security.md + docs/deployment-quickstart.md. Progress: ../ag3ntic-progress-2026-06-07-m11-m12.md; handoff: ../ag3ntic-NEXT-SESSION-GOAL-postM12.md.