---
id: hArqg3EykO4GDb7_rV37o
session_id: session-20260514-workspace17
agent_id: mcp
task: [project:oni-grid] Workspace optimizer session 17: separate terminal UI unmount from session lifecycle (item #16)
outcome: approved
created_at: "2026-05-14T20:52:07.200Z"
---

[project:oni-grid] Completed item #16. New pure resolveTerminalAttachment(pane, terminalSessions) in terminalSession.ts returns idle|attach|spawn — the keep-alive decision: a mounting pane reattaches to a running session that still has a ptyId and was last viewed in that pane, rather than spawning a duplicate. TerminalPane's spawn effect consults it via useAppStore.getState() (read, not subscribed — avoids extra re-renders across 16 panes). Key investigation finding: TerminalPane already never killed the PTY on unmount — the only killPty calls are the explicit handleKill and the worktree-change respawn; no cleanup return killed. So item #16's "no kill on unmount" was already true; the actual gap was the missing reattach path and that the contract was implicit/untested. Made it explicit (documented usePty listener-cleanup as teardown-only) + pinned with a regression test that unmount never invokes kill_pty while explicit kill still does. Convention reinforced: when an item's stated problem is already partly handled, verify with grep before assuming work is needed — and still make the contract explicit + tested even when no behavior change is required. Verification all green: TS 1867/1867, lint, tsc, cargo 163/163, clippy.