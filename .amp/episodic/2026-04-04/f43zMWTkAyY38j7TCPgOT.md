---
id: f43zMWTkAyY38j7TCPgOT
session_id: oni-code-phase6-8-2026-04-03
agent_id: mcp
task: [project:oni-code] Architecture decisions and patterns from Phase 6-8 implementation
outcome: approved
created_at: "2026-04-04T01:12:23.499Z"
---

[project:oni-code] Key architectural decisions and patterns established during Phase 6A-8 implementation:

## Decision: TaskManager as control plane, not execution engine
TaskManager owns the registry (Map<string, BackgroundTask>) and lifecycle but delegates execution to SubagentExecutor (agents) and Coordinator (swarms). This was chosen over alternatives: (A) extending Coordinator to handle agents too (would bloat it), or (C) thin registry with no delegation (too little value). The control/execution split creates a clean seam for Phase 7 remote execution — swap backends without changing tool surface.

## Decision: In-memory task persistence
Tasks live only for the CLI session. No disk persistence. Rationale: AMP memory system handles cross-session persistence. Disk persistence would be premature and duplicate AMP's role.

## Decision: TodoModule linking via shared IDs
TodoModule has no metadata field on Todo items. Linking uses shared IDs (todo.id = task.id). Status sync is one-directional (BackgroundTask → Todo). TodoModule.write() replaces ALL todos — must read-current-append-write. updateStatus() for individual changes.

## Decision: Two-tier cancellation
Graceful: abort("graceful") + 5s setTimeout escalation. Force: abort("force") immediate. Critical implementation detail: in .catch() handlers, check task.abortController.signal.aborted BEFORE marking as "failed" — otherwise the abort-thrown error gets classified as a genuine failure.

## Decision: Config hooks as shell commands
Users configure hooks in oni.config.json as shell commands, not JS. Plugin hooks (wired in 6B-1) handle the programmatic case. Shell commands receive payload as env vars. execSync is appropriate — hooks should be fast and blocking.

## Decision: No worktree "enter/exit" semantics
Worktrees are exposed as create/list/merge/remove, not enter/exit. The model uses worktree paths directly with file tools. Avoids the complexity of dynamically swapping Conductor's rootDir (deeply baked in ~20+ locations).

## Decision: oni serve as foreground, not daemon
YAGNI on daemon management (PID files, signal handling, process forking). Use pm2/systemd/Docker for production daemonization. Server uses Node built-in http — zero new dependencies for <11 endpoints.

## Decision: Auth only when network-bound
Localhost (127.0.0.1) requires no auth. Network (0.0.0.0) auto-generates API key stored in .oni/server.json. Safety net against accidental exposure without burdening local development.

## Pattern: EventBus cast for custom events
TaskEvent is not in core's closed LifecycleEvent union. Cast via `eventBus.emit(event as any)`. EventBus internally dispatches by type string — custom types work at runtime, just need the TS escape hatch.

## Pattern: Plugin hook handler wrapping
Plugin hooks have loose handler types ((...args: unknown[]) => unknown). HooksEngine expects (payload: BasePayload) => HookResult. Wrap with async handler that calls the plugin handler, checks if result has "decision" property, returns { decision: "allow" } as fallback.