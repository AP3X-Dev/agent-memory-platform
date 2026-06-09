---
id: smLJfQHXEYVduoo3CHUOq
session_id: session-20260512-111600
agent_id: mcp
task: [project:oni-grid] optimization session 26: real git diff source for DiffViewer
outcome: approved
created_at: "2026-05-12T18:25:23.551Z"
---

[project:oni-grid] Session 26 in `5adb67c`. Item #24 done — DiffViewer now consumes real `git diff` output from the active pane's worktree, falling back to SAMPLE_HUNKS when no real source is available.

Architecture conventions established:
- **Raw unified-diff text on the wire, client-side parsing.** Rust `get_worktree_diff` returns `String` plus a `files_changed: usize` and `is_clean: bool` derived from the text. TS parses the text via the pre-existing `diffEngine.parseUnifiedDiff`. Keeps the Rust side narrow (one shell-out + validation) and reuses parsing code. Wire format is stable across renderer changes — switching to a per-file expand/collapse UI doesn't touch the backend.
- **Don't share validation helpers between sibling Rust modules.** `diff.rs` has its own copy of the ref-validation logic from `git_merge.rs`. Sharing would create coupling — if git_merge later adds "must exist on remote", diff shouldn't inherit it. ~20 lines of duplication, modules stay independent.
- **Linked worktree gitlinks: `.git` may be file or directory.** `canonical_worktree_path` checks `path.exists()` not `is_dir()` so linked worktrees (where `.git` is a gitlink file containing `gitdir: ...`) work. This matters because the durable run path creates linked worktrees, not full clones.
- **Keep sample fallback when wiring real source — don't delete it.** Spec explicitly said "Keep the sample data as a fallback for storybook / dev-only when no real diff is available." Existing tests (15 DiffViewer tests from Session 22) keep passing against the fallback because they don't assign a task with worktreePath. `activeHunks = useRealDiff ? mapped : SAMPLE_HUNKS` is the entire switch.
- **`useTaskDiff` resolves task → pane → worktreePath.** The hook reads `panes` from the store, finds the pane whose `pane.task?.id === taskId`, falls back gracefully (`hasSource: false`) when any link is missing. Tests pin all four no-source cases (no task, no matching pane, no worktreePath, IPC error) so a future refactor can't break the fallback path.

Operational continuation:
- **Linter parallel work continues across sessions.** This time it added `configClient.persistConnection`, `useConfigHydration` hook, App.tsx mount, SettingsPanel + connections test updates — implementing auto-save-on-change for connection settings (adjacent to Item #23). Reverted via `git checkout HEAD --` plus `rm` for the new files. Same pattern as Sessions 23-25. The linter's `setConnections` bulk setter on appStore was kept — coherent additive change.
- **Commit immediately once tests pass.** Don't pause between green-suite and `git commit` — the linter touches files in that window.

Cumulative this turn: 17 sessions, 25/30 items complete + 4 discoveries (D4 closed). TS 1430 → 1568 (+138). Rust 54 → 119 (+65). Next: Item #25 (CI workflows — .github/workflows/test.yml + build.yml). That + #26 (stricter ESLint) + #27 (code-splitting) + #28 (bundle visualizer) finish Block 6. Then 30/30 backlog complete + the three #30 sub-tasks.