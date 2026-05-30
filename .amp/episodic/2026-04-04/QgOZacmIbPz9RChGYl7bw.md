---
id: QgOZacmIbPz9RChGYl7bw
session_id: oni-code-phase6-8-2026-04-03
agent_id: mcp
task: [project:oni-code] File inventory and new tool/command surface from Phase 6-8
outcome: approved
created_at: "2026-04-04T01:12:45.003Z"
---

[project:oni-code] New files and surface area added during Phase 6A-8 session (2026-04-03):

## New source files
- src/task-manager.ts — TaskManager class, BackgroundTask types, SpawnOpts, TaskEvent, TaskOutput
- src/tools/task.ts — makeTaskTools() returning 6 ToolDefinitions
- src/config-hooks.ts — registerConfigHooks(), shell command hook execution, env var injection
- src/tools/tool-search.ts — makeToolSearchTool() with category classification and keyword search
- src/tools/worktree.ts — makeWorktreeTools() returning 4 ToolDefinitions
- src/server.ts — createONIServer(), generateApiKey(), loadOrCreateApiKey(), 11 route handlers, SSE streaming

## New test files
- src/task-manager.test.ts (25 tests)
- src/tools/task.test.ts (17 tests)
- src/subagent-executor.test.ts (2 tests)
- src/conductor-task.test.ts (1 test)
- src/plugin-runtime.test.ts (6 tests)
- src/config-hooks.test.ts (8 tests)
- src/tools/tool-search.test.ts (9 tests)
- src/tools/worktree.test.ts (10 tests)
- src/ui/command-menu.test.ts (8 tests)
- src/server.test.ts (15 tests)

## Modified files
- src/subagent-executor.ts — AbortSignal support in spawn/run/runDetailed
- src/conductor.ts — TaskManager instantiation, task/memory_query/worktree/tool_search tool registration, config hooks, plugin agent/hook registration, getTaskManager() accessor, real MemoryLoader/MemoryExtractor
- src/coordinator.ts — Real MemoryLoader import, memory context loading in execute(), episodic memory persistence
- src/headless.ts — pluginAgents/pluginHooks passthrough
- src/config.ts — ConfigHookEntry, ConfigHooks types, hooks field on ONICodeConfig
- src/bin.ts — extractPluginAgents/Hooks, pluginAgents/pluginHooks passthrough, serve subcommand
- src/ui/command-menu.ts — CommandDef args support, 5 review/topology commands
- src/ui/ConductorBridge.tsx — TaskEvent subscription, command args forwarding

## New tool surface (12 tools)
task_create, task_get, task_list, task_output, task_update, task_stop, tool_search, worktree_create, worktree_list, worktree_merge, worktree_remove, memory_query

## New slash commands (5)
/review, /security-review, /architecture-review, /migration-review, /topology

## New CLI mode
oni serve [--port N] [--host ADDR]

## Spec and plan documents
- docs/superpowers/specs/2026-04-03-phase6a-task-control-plane-design.md
- docs/superpowers/specs/2026-04-03-phase6b1-plugin-runtime-wiring-design.md
- docs/superpowers/specs/2026-04-03-phase7-remote-execution-design.md
- docs/superpowers/plans/2026-04-03-phase6a-task-control-plane.md
- docs/superpowers/plans/2026-04-03-phase7-remote-execution.md

## Dependency update
@oni.bot/core upgraded from 1.0.1 to 1.2.0 (enables MemoryLoader, MemoryExtractor, memory_query tool exports)