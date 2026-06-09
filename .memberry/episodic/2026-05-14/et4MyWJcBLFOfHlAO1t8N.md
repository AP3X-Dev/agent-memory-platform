---
id: et4MyWJcBLFOfHlAO1t8N
session_id: session-20260514-workspace20
agent_id: mcp
task: [project:oni-grid] Workspace optimizer session 20: wire script phases through the host runner (item #18 host-runner half)
outcome: approved
created_at: "2026-05-14T21:23:45.746Z"
---

[project:oni-grid] Completed item #18 — added runScripts(workspaceId, phase, commands) to the OniHostRunner contract (hostRunner.ts interface + skeleton) and the Tauri-backed localHostRunner. v1 records a dedicated TerminalSession titled by phase (setup/run/teardown) keyed to the workspace worktree; the actual PTY-spawn-and-run of the command list is an honest placeholder, same pattern as the existing runSetup placeholder. runSetup kept for back-compat (capability not dropped). Architectural reason for placeholder: spawning a PTY today goes through usePty, a React hook bound to a component — a host runner (plain module) has no clean path to it yet; recording the phase-titled TerminalSession is the real durable step (TerminalSession is first-class since #15/#16), the PTY-attaching executor is a later wiring item. Convention reinforced: when extending an interface a co-driven file implements (localHostRunner.ts), add the method alongside its siblings — never rewrite the file; only the new method + one new test should touch it. Also: adding a method to OniHostRunner forces updating every implementor AND every mock-runner test object or TS breaks — the hostRunner.test.ts mockRunner needed the new method too. Verification all green: TS 1901/1901, lint, tsc, cargo 163/163, clippy. Block 7 (workspace config + scripts) complete.