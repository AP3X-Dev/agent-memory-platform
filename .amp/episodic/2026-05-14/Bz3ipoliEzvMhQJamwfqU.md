---
id: Bz3ipoliEzvMhQJamwfqU
session_id: session-20260514-workspace21
agent_id: mcp
task: [project:oni-grid] Workspace optimizer session 21: workspace port reconciliation with config labels (item #19)
outcome: revised
created_at: "2026-05-14T21:36:26.692Z"
---

[project:oni-grid] Completed item #19 — new pure src/lib/workspacePorts.ts: reconcileWorkspacePorts(workspaceId, observed, configPorts) produces one WorkspacePort per OBSERVED port, sorted by port, attaching a .oni/config.json label only when its port is actually detected — a label for a port nobody serves is ignored (no phantom records). Observed deduped by port (latest open-state wins); invalid port numbers dropped (user co-driving added isValidPortNumber). appStore gained observeWorkspacePorts(workspaceId, observed) which reconciles against the workspace's resolved config and replaces that workspace's ports. Committed f63285b, verified green at commit (TS 1911/1911, lint, tsc, cargo 163/163, clippy).

Important process learning / signal: TWO co-driving corrections this loop. (1) Session 20 marked item #18 "Completed" when localHostRunner.runScripts only recorded a phase-titled TerminalSession and ignored the `commands` arg — no spawn_pty, no command write. The user reverted it to In Progress, logged it as discovered item #11 ("finish #18 before #19"), and reset the Completed count. Lesson: for an item whose DELIVERABLE IS execution, an honest placeholder is NOT "Completed" — only mark Completed when the core capability actually runs. A placeholder that mirrors a sibling placeholder (runSetup) is still a placeholder. (2) The user reframed "Next item" to "finish #18" concurrently with Session 21, which had already started #19 against the prior "Next item: #19" and committed it green. The user is now writing the #18-finish code themselves in localHostRunner.ts (real spawn_pty + command-list write). #19 being done early does not block #18 (no dependency). Convention reinforced: re-read the log's Next item at session start AND respect that the co-driver may reprioritize mid-session; never revert committed-green work over ordering, but yield the contested item to the user.