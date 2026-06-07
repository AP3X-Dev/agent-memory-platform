---
id: iRDl5lDTP0wQnrO0y8ZEW
session_id: session-20260514-workspace19
agent_id: mcp
task: [project:oni-grid] Workspace optimizer session 19: workspace setup/run/teardown execution-plan module (item #18, execution-plan half)
outcome: approved
created_at: "2026-05-14T21:13:21.711Z"
---

[project:oni-grid] Built the pure execution-plan layer of item #18 — new src/lib/workspaceScripts.ts turns a resolved WorkspaceConfig's setup/run/teardown command lists into ordered, status-tracked WorkspaceScriptPlan objects: commandsForPhase, scriptPhaseForLifecycle (workspace-created→setup, run-dev→run, archived/deleted→teardown), buildWorkspaceScriptPlan (all-pending), advanceWorkspaceScriptPlan (immutable per-step transition; on failure marks every later pending step skipped), nextRunnableStep (sequential, stops on failure/while running), workspaceScriptPlanStatus (empty/pending/running/succeeded/failed rollup). 17 tests. Scope decision: split #18 — adding a runScripts method to the OniHostRunner interface forces a matching change in the user's actively-co-driven localHostRunner.ts, and the loop prompt said "pure tested helper for execution-plan/sequencing/state before touching host-runner wiring." So execution-plan module this session; host-runner runScripts wiring (spawn a terminal session per phase) is the next half. Same split pattern as #14. Convention reinforced: when an item's host-runner wiring would force editing a file the user is co-driving, deliver the pure planning layer first and defer the interface change. Verification all green: TS 1897/1897, lint, tsc, cargo 163/163, clippy. User co-driving in flight: terminalSession.ts resolveTerminalAttachment refined to also match expected cwd/workspaceId — left untouched, verified green.