---
id: Z-lTe5-4903gb7iPbQfbI
session_id: session-20260512-006
agent_id: mcp
task: [project:oni-grid] optimization session 6: Item #6 — wire worktreePath into PTY spawn cwd
outcome: approved
created_at: "2026-05-12T12:07:34.524Z"
---

[project:oni-grid] Completed Item #6 (commit ac848b8). Added PaneState.worktreePath (default null) + setPaneWorktreePath store action. TerminalPane now spawns PTY with cwd = pane.worktreePath ?? projectPath, and respawns on either change. useWorktree.runTaskInWorktree now genuinely orchestrates: awaits create_worktree IPC, THEN binds the path to the pane. TS 1396/1396, Rust 29/29.

Key insights:
1. Two distinct cwd's flow through the system. (a) PTY shell cwd — controls where the bash/powershell process spawns; this is what Item #6 wires. (b) Agent CLI --cwd argument — embedded in the spawn command string by the runtime adapter; tells the agent where its workspace is. preparePipeline still passes projectPath as the agent --cwd; that's correct for the pipeline command builder but unrelated to the PTY shell cwd. For full worktree isolation both should point at the worktree, but they take separate code paths.

2. Pre-existing useWorktree.runTaskInWorktree was a stub. It called createWorktree and returned the worktree info but never bound the path to the pane. The PTY in TerminalPane always spawned with cwd: projectPath. So worktree dirs were created on disk and then ignored at runtime. The "intelligent-orchestrator-v1" tag covered task assignment but not worktree isolation.

3. Critical ordering: create_worktree IPC must complete BEFORE setPaneWorktreePath, otherwise the respawn-on-worktreePath-change effect fires against a directory that doesn't exist on disk. Test "binds the worktree path to the pane after create_worktree resolves" guards this regression.

4. Adding a required field to PaneState ripples through 9 makePane test helpers. tsc -b catches all of them on first compile — strong evidence of where the type is constructed and reassuring that nothing slipped through unnoticed.

5. Two dispatch paths now coexist: (a) legacy v1 — runTask alone, agent runs in projectPath, no worktree isolation; (b) durable — runTask + runTaskInWorktree, agent runs in isolated worktree. The 2026-05-12 plan calls (b) "mandatory for autonomous workers". Callers (currently only ChatSidebar's spawn flow) need to be updated to use (b) — that's a follow-up wiring item, not Item #6 scope.

Next session: Item #7 — wire pendingCommand into actual PTY spawn (currently runTask sets pendingCommand but no code calls invoke('spawn_pty', ...) with it; agents never auto-launch).