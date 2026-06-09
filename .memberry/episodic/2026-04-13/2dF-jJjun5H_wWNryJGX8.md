---
id: 2dF-jJjun5H_wWNryJGX8
session_id: autonomous-s10-plan-mode-2026-04-12
agent_id: mcp
task: [project:oni-code] Autonomous execution of S10 Plan Mode (Phase 4 slice 1/2)
outcome: approved
created_at: "2026-04-13T02:08:06.821Z"
---

[project:oni-code] S10 Plan Mode shipped. 915 tests pass (+31 new) + 1 skipped + 1 pre-existing S04 flake (accepted). Typecheck/lint/build clean; smoke PONG verified. Merged to umbrella with --no-ff. Phase 4 slice 1/2 complete.

Shipped capabilities:
1. EnterPlanMode / ExitPlanMode built-in tools registered in src/tools/plan-mode.ts; thin wrappers over runtime methods.
2. Plan file at .oni/plan.md (configurable) with gray-matter frontmatter (plan_id, agent_id, thread_id, cwd, created_at, status). Atomic write via tmp+rename. Default template body with Steps/Files/Success criteria sections.
3. PermissionManager writable-path exemption — when mode=plan and tool is write_file/edit_file AND path matches settings.plan_mode.writable_paths (default [".oni/plan.md", "**/.oni/plan.md"]), allow. Bash stays denied always. Denial reason includes ExitPlanMode guidance text.
4. Runtime.enterPlanMode — idempotent (EPLAN_ALREADY_ACTIVE recoverable), stashes previous permission mode, writes plan file + plan_mode_start SessionEntry, emits plan_mode_entered, state patch {plan_mode_active: true, active_plan_id}.
5. Runtime.exitPlanMode — restores previous mode, updates plan file status, writes plan_mode_end SessionEntry, optional plan_execute_anchor checkpoint (S09 kind) when approved, emits plan_mode_exited.
6. Runtime.rollbackPlan — walks SessionEntries from anchor forward, collects mutation tool_use (walks both content:[tool_use] and tool_calls[] for driver-shape robustness), reverses via S02 ledger per-path (since ledger.replay is turn-scoped, plans cross turns), emits plan_rolled_back or plan_rollback_incomplete (partial), updates plan file status to "rolled_back".
7. RPCs: enter_plan_mode, exit_plan_mode, rollback_plan, list_plans, get_plan.
8. System prompt "## Plan Mode Active" banner when plan_mode_active true; cache key factors plan_mode_active + plan_file_path.
9. N=2 isolation verified — parent's plan mode doesn't affect subagent permission manager (independent instances).

Advisor decisions: 13 total. 8 OQs pre-resolved, 5 deviations approved in Decision 10, 2 procedural, 1 flake-acceptance continuation, 1 Phase 5 deferral.

5 approved deviations:
- D-1: Hard-coded name check short-circuit in PermissionManager.evaluate for EnterPlanMode/ExitPlanMode. Prevents user deny-rule from bricking plan-mode toggles. Future ToolSpec.read_side flag noted for generalization.
- D-2: Default writable_paths has both ".oni/plan.md" and "**/.oni/plan.md" — defensive for relative vs absolute path arg shapes from edit_file callers.
- D-3: Rollback walks both content:[tool_use] blocks and tool_calls[] assistant fields — driver-shape robustness; llm-call.ts persists one, some drivers use the other.
- D-4: rollbackPlan bypasses ledger.replay and reverts per-path (bounded 0..100 turn-index probe) because ledger.replay is turn-scoped while plans span multiple turns. Not scope creep — surfaced genuine S02 API gap. Backlog: ledger.entriesForAgent helper.
- D-5: Integration tests SC#4/SC#8 set settings.edit.freshness_mode="off" — test accommodation only; production default unchanged.

Phase 4 status: 1/2 done. Next S11 Todo/Task Tracking (TodoWrite/TaskCreate state machine, session sidebar). Matches CC-8. Per PARITY_GAPS.md.

Combined after S10: 915 tests (up from 658 at Phase 1 end, 806 at Phase 2 end, 883 at Phase 3 end). Swarm-native invariants preserved across all 10 slices.

Backlog from S10:
- ledger.entriesForAgent(agent_id) helper — S02 extension for multi-turn rollback.
- read_side flag on ToolSpec — replaces name-check short-circuit with generic mechanism.
- Multi-plan partition by agent_id (.oni/plans/agent_id.md) — future if contention observed.
- Plan file versioning/diff — SessionStore plan_mode_start entries carry historical plan_ids already.
- Bash side-effect rollback — out-of-scope (command-level reverse semantics not available).