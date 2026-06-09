---
id: 9idoBp15fzc-3X0OT_Jdc
session_id: oni-code-phase2-20260401
agent_id: mcp
task: [project:oni-code] Phase 2 spec committed — kernel and permissions hardening with swarm awareness
outcome: approved
created_at: "2026-04-01T09:23:59.054Z"
---

[project:oni-code] Phase 2 design spec committed at docs/superpowers/specs/2026-04-01-phase2-kernel-permissions-design.md (commit cb62ebc).

4 SECTIONS:
1. Unified Tool Pool — single ToolPool class shared by conductor and SwarmRunner (fixes Phase 1 gap: MCP/LSP/plugin tools now available to swarm agents)
2. Permission Context — swarm-aware with persistent rules, path-scoped, per-agent inheritance, audit trail. Swarm agents get swarmPolicy (no-prompt, hard-deny destructive)
3. Policy Transforms — 4 built-in policies (interactive, auto, plan, swarm), composable stack. Topology builders add permission hints (debate=read-only, critic=read-only, mapReduce mapper=read-only)
4. Conductor Decomposition — SubagentExecutor using core's spawnAgent(), CompactionManager, ~600 line reduction

KEY DESIGN DECISIONS:
- Swarm agents get swarmPolicy: auto-approve non-destructive, hard-deny destructive (no UI channel to prompt)
- ToolPool is single source of truth for all tool assembly
- SubagentExecutor uses AgentHandle from @oni.bot/core/harness (background agent handles we built)
- Topology-aware permissions: debate agents read-only, mapReduce mappers read-only, supervisors full access
- Permission audit trail: in-memory ring buffer (200 entries), exposed via /permissions command

READY FOR: writing-plans skill to create implementation plan.