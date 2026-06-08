---
id: 8naDcr9ac4RSMxdgERsjg
session_id: session-20260514-workspace16
agent_id: mcp
task: [project:oni-grid] Workspace optimizer session 16: introduce durable terminal session records for local PTYs (item #15)
outcome: approved
created_at: "2026-05-14T20:41:30.826Z"
---

[project:oni-grid] Completed item #15 — durable TerminalSession records for local PTYs. New pure src/lib/terminalSession.ts (terminalSessionId derives a stable term-<ptyId> id so exit/kill paths re-find the record without threading a separate id through PTY event plumbing; buildTerminalSession; markTerminalSessionStatus immutable transition). usePty now owns the TerminalSession lifecycle alongside the PTY: spawn upserts a 'running' record, the pty-exit listener settles it to 'exited', kill settles to 'killed' — via a private settleTerminalSession find+transition+upsert helper. Key decision: this MIRRORS the existing PaneState.ptyId flow rather than replacing it, so the manual cockpit stays fully intact (item #15 explicitly allowed "first implementation can mirror current state"). Mode-B discovery + fix: TerminalSession.workspaceId was typed required (Session 7) but a manual cockpit pane spawns in the project root with no workspace — made it optional; this is the honest model and doesn't break localHostRunner/findWorkspaceForPane which already tolerate a missing workspace id. Test-placement convention reinforced: the optimizer named TerminalPane for the spawn→session test, but spawn is owned by usePty and TerminalPane is a ~1000-line heavily-mocked component, so the assertion lives in usePty.test.ts where the behavior actually is. Verification all green: TS 1860/1860, lint, tsc, cargo 163/163, clippy.