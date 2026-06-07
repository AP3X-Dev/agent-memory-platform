---
id: 9Zt1mkxKhLq4LzZYcXRtw
session_id: oni-code-phase2-20260401
agent_id: mcp
task: [project:oni-code] Phase 2 implementation plan committed — ready for execution
outcome: approved
created_at: "2026-04-01T09:27:20.169Z"
---

[project:oni-code] Phase 2 implementation plan committed at docs/superpowers/plans/2026-04-01-phase2-kernel-permissions.md (commit aab4976).

PLAN: 8 tasks, 40 steps. TDD approach. Dependency order: ToolPool → PermissionContext → Conductor wiring → Swarm wiring → SubagentExecutor → CompactionManager.

TASKS:
1. ToolPool (tests + implementation)
2. PermissionContext + persistence (tests + implementation, largest task)
3. Wire PermissionContext into Conductor
4. Wire PermissionContext into SwarmRunner + topology hints
5. Wire ToolPool into Conductor + SwarmRunner
6. SubagentExecutor (tests + implementation + conductor wiring)
7. CompactionManager (tests + implementation + conductor wiring)
8. Final verification

KEY ONI-SPECIFIC FEATURES:
- Topology permission hints: debate agents read-only, mapReduce mappers read-only
- swarmPolicy: auto-approve non-destructive, hard-deny destructive (no prompt channel)
- ToolPool shared between conductor and SwarmRunner (MCP/LSP/plugins available to swarm agents)
- SubagentExecutor uses core's spawnAgent()/AgentHandle for lifecycle management