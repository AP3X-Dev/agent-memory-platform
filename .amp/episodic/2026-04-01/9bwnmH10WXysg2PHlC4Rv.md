---
id: 9bwnmH10WXysg2PHlC4Rv
session_id: oni-code-phase2-20260401
agent_id: mcp
task: [project:oni-code] Phase 2 COMPLETE — kernel and permissions hardening with swarm awareness
outcome: approved
created_at: "2026-04-01T10:00:16.317Z"
---

[project:oni-code] Phase 2 COMPLETE. All 7 implementation tasks done, tested, committed.

COMMITS (7 implementation commits):
- cbcea96 feat: add ToolPool for centralized tool assembly
- a583e2d feat: replace PermissionManager with PermissionContext — policies, paths, audit, persistence
- 8c5b1a3 feat: wire PermissionContext into conductor, replace manual permission checks
- df65959 feat: wire swarm-aware permissions — topology hints, permission gating
- 485609f feat: wire ToolPool into conductor and SwarmRunner
- 6691702 feat: add SubagentExecutor using core's spawnAgent/AgentHandle
- 10ea15d feat: extract CompactionManager from conductor

TEST RESULTS: 2304 tests pass, 0 new failures, typecheck clean.

NEW FILES:
- src/tool-pool.ts (ToolPool — centralized tool assembly)
- src/permissions-persistence.ts (load/save .oni/permissions.json)
- src/subagent-executor.ts (SubagentExecutor with AgentHandle)
- src/compaction-manager.ts (CompactionManager)
- 5 test files (tool-pool, permission-context, swarm-permissions, subagent-executor, compaction-manager)

MODIFIED FILES:
- src/permissions.ts (PermissionContext replaces PermissionManager — 4 policies, path-scoping, audit, persistence)
- src/conductor.ts (delegates to ToolPool, PermissionContext, SubagentExecutor, CompactionManager)
- src/swarm-runner.ts (accepts ToolPool + PermissionContext, wraps tools with permission gates)
- src/topology-agent-builder.ts (permission hints: debate=read-only, mapReduce mappers=read-only)
- src/tools/spawn-swarm.ts (passes permissions through)

WHAT'S NOW TRUE:
- Swarm agents operate under swarmPolicy (destructive ops hard-denied, no prompt channel)
- Debate topology agents are read-only
- MapReduce mapper agents are read-only, reducer has full access
- MCP/LSP/plugin tools available to ALL execution tiers via shared ToolPool
- Permission decisions are auditable (200-entry ring buffer)
- Permission rules persist to .oni/permissions.json
- Path-scoped rules work (e.g., allow edits in src/ but deny .env)
- Plan mode uses policy stack (push planPolicy on enter, pop on exit)
- SubagentExecutor uses AgentHandle for lifecycle management
- CompactionManager consolidates scattered compaction logic

NEXT: Phase 3 (agent runtime upgrades) or Phase 5 (remote) per roadmap.