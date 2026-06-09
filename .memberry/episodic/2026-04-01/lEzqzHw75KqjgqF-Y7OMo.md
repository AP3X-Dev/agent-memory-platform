---
id: lEzqzHw75KqjgqF-Y7OMo
session_id: oni-code-phase3-20260401
agent_id: mcp
task: [project:oni-code] Phase 3 plan committed — ready for execution
outcome: approved
created_at: "2026-04-01T16:43:42.420Z"
---

[project:oni-code] Phase 3 implementation plan committed at docs/superpowers/plans/2026-04-01-phase3-agent-runtime.md (commit 4c6d19f).

PLAN: 6 tasks, 29 steps.

TASKS:
1. ConflictResolver — severity classification (none/safe/warning/critical), replaces ConflictDetector
2. WorktreeManager — git worktree create/remove/merge/prune with real git operations
3. Coordinator — orchestration connecting TaskEvaluator + SwarmRunner + EventBus + topology override
4. Wire Coordinator into Conductor + /coordinate command
5. Wire WorktreeManager into SwarmRunner (rewrite agent rootDir to worktree path)
6. Final verification

ONI-SPECIFIC DIFFERENTIATION:
- Topology-aware worktree strategies (fan-out: parallel, pipeline: sequential branching, debate: no worktrees)
- Coordinator leverages existing TaskEvaluator + EventBus + SwarmCheckpointStore
- ConflictResolver has read/write awareness (reads never conflict)
- Manual topology override via /coordinate command