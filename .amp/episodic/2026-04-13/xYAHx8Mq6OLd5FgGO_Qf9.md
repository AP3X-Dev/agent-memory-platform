---
id: xYAHx8Mq6OLd5FgGO_Qf9
session_id: autonomous-s08-compaction-2026-04-12
agent_id: mcp
task: [project:oni-code] Autonomous execution of S08 Compaction Reliability (Phase 3 slice 1/2)
outcome: approved
created_at: "2026-04-13T00:30:37.537Z"
---

[project:oni-code] S08 Compaction Reliability shipped. 848 tests pass (+43 new) + 1 skipped + 1 pre-existing S04 flake (accepted per S07 Decision 11, extended in S08 Decision 12 to cover both retention and foreground-timeout Windows fs flakes in the same test file). Typecheck/lint/build clean; smoke PONG verified against openai/gpt-4o-mini. Merged to umbrella feat/coding-agent-parity-v0.2 with --no-ff (merge commit b9b7995).

Key shipped capabilities:
1. Iterative summary fold — extractPriorSummary detects <conversation_summary> at messages[0], drops it from the pre-cut block, and uses ROOT_FOLD_TEMPLATE with explicit <prior> tag to merge old+new (not regenerate from scratch). Beats pi's regenerate-every-time.
2. 3-level escalation ladder — compact_escalation_level state channel (0-3). Overflow bumps level; keep_recent_tokens multiplied by escalation_steps (default [1.0, 0.75, 0.5]). Level 4 aborts with halt_reason: "overflow_after_compact" (new literal). compaction_escalated events fire on bumps; compaction_aborted on terminal.
3. Optional cheaper summary_model — routes through DispatchDriver.getDriver() when settings.compaction.summary_model is set. Preserves multi-provider invariant.
4. Top-K file restoration — selectRestoreFiles ranks state.file_freshness by recency; buildRestoredMessages produces synthetic role:"tool" messages with tool_call_id: "restore-<N>" and <restored_file> XML wrapping. Ordered AFTER summary, BEFORE kept tail (Decision 6). Respects per-file max_bytes + total bytes_budget.
5. Per-role compaction strategies — agent_role "subagent" uses SUBAGENT_BRIEF_TEMPLATE producing structured prose (- task/completed/findings/blockers), populates state.subagent_brief (for S12 consumer), skips file restoration. "coordinator" tagged but stub until S13. "root" gets full treatment.
6. PreCompact/PostCompact payload extensions — agent_role, escalation_level, summary_model_resolved, prior_summary_present, restored_files, brief. S06 HooksEngine unchanged; additive only.
7. RPC additions — compact return shape extended with restored_files + escalation_level; new get_compaction_status for lightweight inspection.
8. skill_depth resets to 0 in compaction state patch (resolves S07 backlog item).

Advisor decisions: 14 total. 8 OQs pre-resolved in spec, 4 deviations approved in Decision 11, 2 procedural (subagent-driven execution, merge to umbrella with --no-ff), 1 flake-acceptance (Decision 12 extends S07 Decision 11 to cover both Windows S04 fs flakes), 1 Phase 5 optimization deferral consistent with precedent.

4 approved deviations:
- D-1: FreshnessEntry ranking uses `at` timestamp (spec referenced non-existent last_read_turn/last_edit_turn fields); added to S09+ backlog.
- D-2: Byte-budget enforcement moved from selectRestoreFiles to buildRestoredMessages (cleaner with actual on-disk sizes).
- D-3: Restored messages use top-level tool_call_id + metadata: {restored: true} plus XML-embedded id (additive robustness).
- D-4: compact_escalation_level reset at turn-start, not turn-end (functionally equivalent; avoids post-stream state write race).

Phase 3 status: 1/2 done. Next S09 (checkpoint + queue durability). Phase 2 + S08 combined: 848 tests (up from 658 at Phase 1 end). Swarm-native invariants preserved: agent_role drives template selection, subagent_brief channel ready for S12, all compaction events carry agent_id.

Backlog from S08 (in NOTES.md and advisor log):
- S04 Windows fs flake triage slice — use fs.rm({force, maxRetries}) and longer retention windows.
- FreshnessEntry turn-indexed fields (last_read_turn, last_edit_turn) — S03 extension for better restoration ranking.
- Smart-window restoration snippets (currently head-only).
- subagent_brief consumer in S12, coordinator_brief consumer in S13.