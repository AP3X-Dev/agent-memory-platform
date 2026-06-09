---
id: rGKx2X3cX2XA6n_adIKpM
session_id: session-20260512-007
agent_id: mcp
task: [project:oni-grid] optimization session 7: Item #7 — wire pendingCommand into actual PTY spawn (scope refined to dispatch consolidation)
outcome: approved
created_at: "2026-05-12T12:18:12.204Z"
---

[project:oni-grid] Completed Item #7 (commit a178b1a). Item #7's original problem statement was incorrect — the existing TerminalPane pending-command effect DID write pendingCommand into the live shell PTY, so agents WERE launching. The real gap was orchestration ownership: KanbanBoard + ChatSidebar called store.runTask directly, bypassing the worktree creation flow Session 6 wired up.

Resolution:
1. runTaskInWorktree promoted to top-level exported function (was hook-only). It now owns the full lifecycle: preparePipeline → create_worktree → runTask(task, options) with race detection.
2. runTask gained an options bag: { worktreePath, expectedPaneId, expectedBranch }. Refuses stale plans where the planned pane got occupied between prepare and dispatch — returns null.
3. KanbanBoard + ChatSidebar migrated from store.runTask to runTaskInWorktree.
4. Orphan cleanup: when dispatch race detected, removes the freshly-created worktree from disk. Best-effort .catch (does not mask the dispatch error).
5. killPane resets worktreePath.
6. Documentation comment at top of TerminalPane explains the two-effect spawn lifecycle (spawn shell → write pendingCommand). The shell-then-write architecture is intentional (Windows ConPTY + manual fallback if agent exits).

Key insight — original spec text can be wrong about current state. The optimizer prompt for Item #7 said "no code calls invoke('spawn_pty') with [pendingCommand]. Agents never launch." Verifiable falsehood: TerminalPane's pending-command effect writes it into the live shell. Always audit before applying a backlog item's prescribed fix (3rd time this convention has paid off — Items #2, #3, #7).

Test pattern for IPC race conditions: inject the race synchronously inside the Promise executor (mutate store, then resolve). Avoids setTimeout flakiness.

Caveat: most of the refactor was pre-applied by user/linter between Session 6 ending and Session 7 starting. Session 7's direct contributions: aligning useWorktree.test.ts with new API, the TerminalPane lifecycle comment, runTask handoff comment. Acknowledged in log.

Next: Item #8 — replace mergeFlow simulation with merge_queue backend calls.