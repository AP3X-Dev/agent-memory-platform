---
id: FwjoyS-2jIwhi3dUsW4aC
session_id: autonomous-s02-error-taxonomy-2026-04-12
agent_id: mcp
task: [project:oni-code] Autonomous execution of S02 — Tool Error Taxonomy + Auto-Rollback
outcome: approved
created_at: "2026-04-12T15:50:09.958Z"
---

[project:oni-code] S02 complete on umbrella feat/coding-agent-parity-v0.2 (merge e5d4a14). Ships classified error taxonomy (ok/transient/recoverable/unrecoverable + 4 reserved for S05/S12) with tool-executor-owned retry, per-(agent_id, turn_index) RollbackLedger, and opt-in auto-rollback harness for Edit+settings.edit.test_command. New files: src/rollback-ledger.ts, src/tool-classification.ts. Tests +20 (7 ledger, 5 classification, 8 integration incl. N=2 isolation) → 577 pass + 1 skipped. Typecheck/lint clean, smoke PONG. Six deviations, all approved: per-runtime ledgers in N=2 test; unrecoverable path returns halt-state AND transcript message; new turn_end.stop_reason="unrecoverable_error"; BashController cwd swap-restore for test_command; over-cap ledger unit-only test; loose onRollbackTurn typing. Halt vocabulary now: turn_cap | loop_detected | unrecoverable_error | null. Key design holds: retry authority single (executor), ledger runtime-local not checkpointed, fail-closed on test-cmd errors, this-agent-only rollback scope. Phase 5 advisor-deferred per S01 precedent. Forward risks documented for S03+ (edit freshness vs pre-image capture order in future incremental-read refactor; BashController.exec needs cwd arg in S04; preserve_ledger_turns has no memory bound, S09 ring-buffer target; halt_reason union S05/S12 extensions; cross-session rollback deferred; test_command PATH semantics need docs).