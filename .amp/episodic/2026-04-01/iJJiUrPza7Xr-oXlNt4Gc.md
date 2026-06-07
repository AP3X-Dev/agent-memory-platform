---
id: iJJiUrPza7Xr-oXlNt4Gc
session_id: oni-code-phase3-20260401
agent_id: mcp
task: [project:oni-code] Phase 3 scope approved — worktree manager, coordinator mode, conflict resolution
outcome: approved
created_at: "2026-04-01T16:37:00.802Z"
---

[project:oni-code] Phase 3 scope approved. 3 items focused on ONI-native differentiation:

1. Worktree Manager — git worktree isolation per swarm agent, topology-aware semantics (fan-out: parallel worktrees, pipeline: sequential handoff, debate: no worktree needed due to read-only permissions)
2. Coordinator Mode — connects TaskEvaluator + SwarmRunner + EventBus + SwarmCheckpointStore behind a coherent interface, manual topology override, multi-phase task decomposition
3. Conflict Resolution — wire ConflictDetector, add read/write distinction, worktree-based merge, sequential fallback, human escalation

DROPPED FROM ORIGINAL ROADMAP (already done or premature):
- Managed subagent lifecycles → DONE (SubagentExecutor)
- Background agent tasks → DONE (spawnAgent)
- Adaptive topology learning → premature
- Cross-swarm coordination → premature
- Team persistence → premature

EXISTING INFRASTRUCTURE TO LEVERAGE:
- SwarmCheckpointStore (checkpoint on failure, resume method exists)
- SessionTree/SessionFork (branch-based conversation management)
- TaskEvaluator + TopologySelector (auto-dispatch with confidence scoring)
- EventBus bridging (swarm.agent.started/completed/failed events)
- Nested swarms (configurable depth, child runners)
- ConflictDetector (skeleton exists, not wired)
- BackgroundScheduler (periodic task runner)
- PermissionContext with swarmPolicy + topology hints (from Phase 2)