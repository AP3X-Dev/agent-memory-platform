---
id: Bqm2cYim0uJ5lWz0JXbzY
session_id: oni-code-phase3-20260401
agent_id: mcp
task: [project:oni-code] Phase 3 starting — agent runtime upgrades with ONI-native focus
outcome: approved
created_at: "2026-04-01T15:31:40.559Z"
---

[project:oni-code] User directive repeated: design Phase 3 with ONI's unique swarm/topology strengths in mind. Don't just copy Claude Code patterns.

PHASE 3 ROADMAP ITEMS (from original roadmap):
1. Add managed subagent lifecycles — PARTIALLY DONE (SubagentExecutor + AgentHandle built in Phase 2)
2. Add background agent tasks — DONE (spawnAgent in core)
3. Add resumable agent handles — NOT DONE (AgentHandle exists but no persistence/resume after restart)
4. Add worktree isolation — NOT DONE (git-specific, product-level)
5. Add coordinator mode — NOT DONE (biggest opportunity for ONI differentiation)

ONI-NATIVE OPPORTUNITIES FOR PHASE 3:
- Worktree isolation PER SWARM AGENT (not just single subagent) — fan-out agents work in parallel worktrees, no file conflicts
- Coordinator mode using TopologySelector + TaskEvaluator + supervisor strategies (far richer than Claude Code's basic coordinator)
- Resumable swarm execution via SwarmCheckpointStore (already exists in ONI, not wired)
- Agent pool management via core's AgentPool with backpressure
- Event-driven monitoring via EventBus (swarm progress, agent lifecycle events)

WHAT'S ALREADY BUILT:
- Core: spawnAgent(), AgentHandle (background execution with send/cancel/onEvent)
- Phase 2: SubagentExecutor (wraps spawnAgent), ToolPool (shared tools), PermissionContext (swarm-aware)
- Existing: SwarmRunner, TopologySelector, TopologyAgentBuilder, TaskEvaluator, SwarmCheckpointStore, ConflictDetector