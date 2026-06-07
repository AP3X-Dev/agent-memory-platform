---
id: GwNk_MQQsMvM2sPH4hYnO
session_id: autonomous-s09-checkpoint-2026-04-12
agent_id: mcp
task: [project:oni-code] Autonomous execution of S09 Checkpoint + Queue Durability (Phase 3 slice 2/2) — Phase 3 complete
outcome: approved
created_at: "2026-04-13T01:14:23.527Z"
---

[project:oni-code] S09 Checkpoint + Queue Durability shipped. 883 tests pass (+35 new) + 1 skipped + 1 pre-existing S04 retention flake (accepted per S08 Decision 12). Typecheck/lint/build clean; smoke PONG verified against openai/gpt-4o-mini. Merged to umbrella feat/coding-agent-parity-v0.2 with --no-ff (merge commit then advisor log 659ef87). Phase 3 Long-Task Reliability now fully done (S08 + S09).

Key shipped capabilities:
1. Persisted per-thread queues — new SessionEntryKinds queue_enqueue (payload: queue, item_id, text, enqueued_at, agent_id) and queue_drain (queue, drained_item_ids, drained_at, turn_index, agent_id). runtime.steer()/followUpMsg() write the enqueue before in-memory push; drainQueues() writes drain with exact consumed ids. Synchronous SQLite (OQ-7 durability-before-ack).
2. Runtime queue rebuild on setThreadId/construction — rebuildQueuesFromStore() populates in-memory from active queue state (enqueued minus drained). Emits queue_update on reconnect.
3. Intra-turn checkpoint — new SessionEntryKind checkpoint (payload: turn_index, agent_id, last_tool_call_id, messages_since_turn_start, state_hash, created_at). Tool-executor calls deps.emitCheckpoint after each tool result merges into state. state_hash is stable-JSON sha256 of curated subset {messages_length, turn_count, compact_escalation_level, skill_depth, halt_reason, aborted}. Configurable via settings.checkpoint.{enabled, every_n_tool_results, detection_on_startup}.
4. Interrupted turn detection — SessionStore.detectInterruptedTurns({thread_id?}) walks back from leaf, finds most recent turn_start, reports tool_call without matching tool_result where no turn_end/halt follows. Multi-orphan marked for EINTERRUPTED_MULTI_ORPHAN. Per-thread scoped; subagent interruption doesn't cascade.
5. Runtime integration — maybeDetectInterrupted() on construction/setThreadId; stashes resumeReport; emits thread_resumable event via emitDirect when detection_on_startup true. runtime.resumable property set.
6. Resume RPC — resume({thread_id, strategy: retry_tool | abandon_tool | inspect}). retry_tool re-invokes via toolHost.getHandler with fresh S05 permission + S06 hook gates (OQ-3). abandon_tool writes synthetic tool_result (is_error: true, "ABANDONED:" prefix) + turn_end (stop_reason: "resumed_after_abandon"). inspect is read-only. Emits turn_resumed.
7. Queue inspection/clear RPCs — list_queue, clear_queue (synthesizes drain without consuming), list_interrupted_turns (all threads).
8. Settings additions — settings.checkpoint = {enabled, every_n_tool_results: 1, detection_on_startup: true}; settings.queue_durability = {enabled: true}.

Advisor decisions: 14 total. 8 OQs pre-resolved in spec, 3 deviations approved in Decision 11, 2 procedural, 1 flake-acceptance continuation (S04), 1 Phase 5 deferral.

3 approved deviations:
- D-1: SessionStore.entries() changed to ORDER BY rowid ASC (was created_at ASC, id ASC) — fixes latent same-millisecond insert non-determinism uncovered by S09 interrupted-turn detection tests. Bug fix, not scope creep. All prior tests still green.
- D-2: resume(retry_tool) re-invokes via toolHost.getHandler with standalone S05/S06 gate calls rather than full tool-executor node traversal — preserves OQ-3 fresh-gate guarantee but skips S02 retry/classification loops. Spec ambiguous; defensible bounded-side-effects choice.
- D-3: getToolCallByUseId helper retained (spec'd) even though runtime.resume uses report's embedded args directly — harmless future-proofing for UI/forensic tooling.

Phase 3 win state: 100-turn oni-code session now survives crash/SIGTERM/dropped-RPC without losing steering/follow-up OR silently skipping tools mid-turn. Pi loses queues on crash; Claude Code has neither persisted queues nor intra-turn checkpoints. Beat both cleanly.

Combined after S09: 883 tests (up from 806 at Phase 2 end, 658 at Phase 1 end). Swarm-native invariants preserved across all 9 slices: agent_role/agent_id/parent_agent_id plumbed from S01, per-thread queues in S09, per-agent rollback in S02, per-(agent_id, path) freshness in S03, killByAgent in S04, agent-scoped permission in S05, agent-aware hooks in S06, role-filtered skills in S07, per-role compaction in S08, per-thread checkpoint/detection in S09.

Next: Phase 4 (Core Tools) — S10 Plan Mode (two-phase plan→execute, write-restricted), S11 Todo/Task Tracking (TodoWrite/TaskCreate state machine, session sidebar). Per PARITY_GAPS.md CC-7/CC-8.

Backlog from S09 (in NOTES.md and advisor log):
- S04 Windows fs flake hardening slice (retention + foreground-timeout tmpdir rmdir).
- state_hash divergence resolution — currently recorded, not acted on.
- Queue TTL / pruning for long-lived threads.
- Multi-orphan auto-recovery UI flow.
- Resume retry_tool with S02 retry loop (current is single-shot through gates).