---
id: 2eE9ODJNLiZKboi4QNNkR
session_id: oni-code-phase6-8-2026-04-03
agent_id: mcp
task: [project:oni-code] Implement Phases 6A, 6B, 6C, 7, and 8 from the Claude parity gap analysis — background task control plane, automation/extension surface, real memory, remote execution, and review productization
outcome: approved
created_at: "2026-04-04T01:11:58.923Z"
---

[project:oni-code] Implemented the full gap analysis roadmap (Phases 6A through 8) in a single session. 17 commits, 101 new tests, all passing.

## Phase 6A — Runtime Control Plane
- Created TaskManager class (src/task-manager.ts) as a unified control plane for background agents and swarms. Sits above SubagentExecutor and Coordinator. Owns a Map<string, BackgroundTask> registry.
- Design decision: TaskManager is a control plane, not an execution engine. It delegates to existing engines and tracks lifecycle. This separation enables future remote execution (Phase 7) — swap execution backends without changing the control surface.
- Added 6 CRUD tools: task_create, task_get, task_list, task_output, task_update, task_stop. Matches Claude Code's task tool surface.
- Two-tier cancellation: graceful (5s grace period via AbortController.abort("graceful") + setTimeout escalation) and force (immediate). Cascades to child tasks for swarm parent stops.
- TodoModule integration: background tasks appear as todo items via shared ID linking. Status sync is one-directional (BackgroundTask → Todo). TodoModule's Todo type uses `content` not `subject`, and has no `metadata` field — linking uses `id` matching.
- Added AbortSignal support to SubagentExecutor.spawn/run/runDetailed. Critical fix: in the abort catch handler, check task.abortController.signal.aborted before marking as "failed" — otherwise graceful stop produces "failed" instead of "cancelled" (race condition).

## Phase 6B — Automation & Extension
- Plugin runtime wiring: extractPluginAgents() → AgentRegistry.register(), extractPluginHooks() → HooksEngine.on() with handler wrapping (plugin handlers return loose types, HooksEngine expects HookResult). Both flow through ConductorConfig from bin.ts.
- Config hooks (src/config-hooks.ts): declarative shell-command hooks in oni.config.json. registerConfigHooks() converts ConfigHookEntry objects into HookDefinition registrations. Shell commands receive payload data as env vars (TOOL_NAME, FILE, INPUT, OUTPUT). execSync with timeout.
- Tool discovery (src/tools/tool-search.ts): tool_search tool with keyword/category matching. CATEGORY_MAP classifies known tools. Searches name, description, and category. Categories: coding, web, orchestration, task, planning, cron, lsp, mcp, custom.
- Worktree tools: worktree_create, worktree_list, worktree_merge, worktree_remove wrapping existing WorktreeManager. Design decision: no "enter/exit" semantics — worktrees are separate directories, model uses paths directly with file tools.

## Phase 6C — Real Memory
- Updated @oni.bot/core from 1.0.1 to 1.2.0. The memory system (MemoryLoader, MemoryExtractor) was already implemented in core source but not exported in the published package. 1.2.0 exports everything.
- Removed all MemoryLoader/MemoryExtractor stubs in conductor.ts and coordinator.ts. Wired real instances.
- MemoryLoader.fromRoot() creates the loader. MemoryLoader.getQueryTool() provides the memory_query ToolDefinition — registered alongside other tools.
- Coordinator now loads memory context before swarm dispatch: wake() → orient() → match(task) → buildSystemPrompt(). Also persists episodic memory after swarm completion via persistEpisodic().
- MemoryExtractor takes the fast model + loader, extracts durable facts from session summaries.

## Phase 7 — Remote Execution
- Created src/server.ts: HTTP server using Node built-in http module, zero new dependencies.
- 11 REST endpoints mapping to existing APIs: task CRUD (6), session management (4), status (1). Plus SSE streaming for task events.
- Auth model: no auth for localhost (127.0.0.1), API key required when bound to 0.0.0.0. Key auto-generated, stored in .oni/server.json.
- `oni serve [--port N] [--host ADDR]` subcommand in bin.ts. Default port 4195. Graceful SIGINT shutdown.
- Design decision: foreground server only, no daemon. Use pm2/systemd for background.

## Phase 8 — Review Productization
- 4 review slash commands: /review → critiqueRefine, /security-review → redTeam, /architecture-review → ensembleVote, /migration-review → stepwiseVerify. All use conductor.setTopologyOverride().
- /topology command for manual override control (set or clear).
- Extended CommandDef interface to pass args (backward compatible). ConductorBridge forwards args from input string.

## Key Architecture Patterns
- Control plane / execution plane separation (TaskManager vs SubagentExecutor/Coordinator)
- EventBus for lifecycle events with TaskEvent cast to any (LifecycleEvent is closed union in core)
- TodoModule as display layer, BackgroundTask as source of truth
- Config hooks use execSync (synchronous, blocking) — appropriate for pre/post tool hooks
- Server reuses all existing APIs — zero new business logic, just HTTP transport